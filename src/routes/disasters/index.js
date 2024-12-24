const express = require("express");
const admin = require("firebase-admin");
const checkAuth = require("../../middleware/authentication");
const createResponse = require("../../utils/helper-functions");

const router = express.Router();

const disasters = ["earthquake", "flood", "fire outbreak", "hurricane"];
const randomDisaster = disasters[Math.floor(Math.random() * disasters.length)];

router.get("/random-disaster", checkAuth, async (req, res) => {
  try {
    // Fetch assets with isDestroyed == false
    const allAssetsSnapshot = await admin
      .firestore()
      .collection("userAssets")
      .where("isDestroyed", "==", false)
      .get();

    const allAssets = allAssetsSnapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    // Filter individual and league assets
    const individualAssets = allAssets.filter(
      (asset) => !asset.leagueId || asset.leagueId === ""
    );
    const leagueAssets = allAssets.filter(
      (asset) => asset.leagueId && asset.leagueId !== ""
    );

    // Group assets by user and league
    const userAssetsMap = {};

    // Group individual assets
    individualAssets.forEach((asset) => {
      const key = asset.userId;
      if (!userAssetsMap[key]) {
        userAssetsMap[key] = [];
      }
      userAssetsMap[key].push(asset);
    });

    // Group league assets
    leagueAssets.forEach((asset) => {
      const key = `${asset.userId}_${asset.leagueId}`;
      if (!userAssetsMap[key]) {
        userAssetsMap[key] = [];
      }
      userAssetsMap[key].push(asset);
    });

    // Select random assets for destruction
    const randomAssets = [];
    Object.entries(userAssetsMap).forEach(([key, assets]) => {
      const count = Math.min(assets.length, Math.floor(Math.random() * 2) + 1);
      for (let i = 0; i < count; i++) {
        const randomIndex = Math.floor(Math.random() * assets.length);
        randomAssets.push(assets.splice(randomIndex, 1)[0]);
      }
    });

    // Mark the selected assets as destroyed in Firestore
    const batch = admin.firestore().batch();
    randomAssets.forEach((asset) => {
      const assetRef = admin.firestore().collection("userAssets").doc(asset.id);
      batch.update(assetRef, { isDestroyed: true });
    });
    await batch.commit();

    // Extract building IDs and userIds from the destroyed assets
    const buildingIds = randomAssets
      .map((asset) => String(asset.buildingId)) // Convert to string
      .filter((id) => typeof id === "string" && id.trim() !== "");

    // If no valid building IDs are found, return an error response
    if (buildingIds.length === 0) {
      return res
        .status(400)
        .json(createResponse(false, "No valid building IDs found"));
    }

    // Fetch building details from Firestore using the building IDs
    const buildingsSnapshot = await admin
      .firestore()
      .collection("buildings")
      .where(admin.firestore.FieldPath.documentId(), "in", buildingIds)
      .get();
    const buildings = buildingsSnapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    // Calculate the destruction summary grouped by user ID and building type
    const destructionMap = {};
    randomAssets.forEach((asset) => {
      const building = buildings.find(
        (b) => String(b.id) === String(asset.buildingId)
      );
      if (building) {
        const title = building.title.toLowerCase();
        const normalizedTitle = title.replace(/house[a-z]*$/, "house");
        const key = asset.leagueId
          ? `${asset.userId}_${asset.leagueId}`
          : asset.userId;

        if (!destructionMap[key]) {
          destructionMap[key] = {
            userId: asset.userId,
            leagueId: asset.leagueId || null,
            buildings: {},
          };
        }
        if (!destructionMap[key].buildings[normalizedTitle]) {
          destructionMap[key].buildings[normalizedTitle] = 0;
        }
        destructionMap[key].buildings[normalizedTitle] += 1;
      }
    });

    // Create disaster response with leagueId
    const disasterResponse = Object.values(destructionMap).map((data) => ({
      disaster: randomDisaster,
      destruction: data.buildings,
      userId: data.userId,
      leagueId: data.leagueId,
    }));

    // Update disaster document
    const disasterDoc = {
      message: `Destruction caused by ${randomDisaster}`,
      affectedUsersList: disasterResponse,
      disasterType: randomDisaster,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    await admin.firestore().collection("disasters").add(disasterDoc);

    const notificationDoc = {
      message:
        "There have been a disaster! Run back to your city and save your civilians",
      notificationType: "disaster",
      isGlobal: true,
      userID: null,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    await admin.firestore().collection("notifications").add(notificationDoc);

    // Send the response with the destruction summary and the random disaster
    res.json(
      createResponse(
        true,
        `Destruction caused by ${randomDisaster}`,
        disasterResponse
      )
    );
  } catch (error) {
    // Handle any errors that occur during the process
    console.error("Error getting random disaster:", error);
    res
      .status(500)
      .json(createResponse(false, "An error occurred", error.message));
  }
});

const formatDestructionMessage = (destruction) => {
  const messages = [];
  Object.entries(destruction).forEach(([building, count]) => {
    messages.push(`${count} ${building}${count > 1 ? "s" : ""}`);
  });
  return messages.join(", ") + " destroyed";
};

router.get("/user-destruction/:disasterId", checkAuth, async (req, res) => {
  try {
    const { disasterId } = req.params;
    const userId = req.user.user_id;

    const disasterDoc = await admin
      .firestore()
      .collection("disasters")
      .doc(disasterId)
      .get();

    if (!disasterDoc.exists) {
      return res.status(404).json(createResponse(false, "Disaster not found"));
    }

    const disasterData = disasterDoc.data();
    const userDestructions = disasterData.affectedUsersList.filter(
      (item) =>
        item.userId === userId && (!item.leagueId || item.leagueId === "")
    );

    // Add destruction message to each item
    const destructionsWithMessage = userDestructions.map((item) => ({
      ...item,
      destructionMessage: formatDestructionMessage(item.destruction),
    }));

    res.json(
      createResponse(
        true,
        "User destruction data retrieved",
        destructionsWithMessage
      )
    );
  } catch (error) {
    console.error("Error getting user destruction:", error);
    res
      .status(500)
      .json(createResponse(false, "An error occurred", error.message));
  }
});

router.get(
  "/league-destruction/:disasterId/:leagueId",
  checkAuth,
  async (req, res) => {
    try {
      const { disasterId, leagueId } = req.params;
      const userId = req.user.user_id;

      const disasterDoc = await admin
        .firestore()
        .collection("disasters")
        .doc(disasterId)
        .get();

      if (!disasterDoc.exists) {
        return res
          .status(404)
          .json(createResponse(false, "Disaster not found"));
      }

      const disasterData = disasterDoc.data();
      const leagueDestructions = disasterData.affectedUsersList.filter(
        (item) => item.userId === userId && item.leagueId === leagueId
      );

      const destructionsWithMessage = leagueDestructions.map((item) => ({
        ...item,
        destructionMessage: formatDestructionMessage(item.destruction),
      }));

      res.json(
        createResponse(
          true,
          "League destruction data retrieved",
          destructionsWithMessage
        )
      );
    } catch (error) {
      console.error("Error getting league destruction:", error);
      res
        .status(500)
        .json(createResponse(false, "An error occurred", error.message));
    }
  }
);

module.exports = router;
