const express = require("express");
const admin = require("firebase-admin");
const checkAuth = require("../../middleware/authentication");
const createResponse = require("../../utils/helper-functions");

const router = express.Router();

const disasters = ["earthquake", "flood", "fire outbreak", "hurricane"];

router.get("/random-disaster", checkAuth, async (req, res) => {
  try {
    // Fetch all user assets from Firestore
    const userAssetsSnapshot = await admin
      .firestore()
      .collection("userAssets")
      .get();
    const userAssets = userAssetsSnapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    // Group assets by user
    const userAssetsMap = userAssets.reduce((acc, asset) => {
      if (!acc[asset.userId]) {
        acc[asset.userId] = [];
      }
      acc[asset.userId].push(asset);
      return acc;
    }, {});

    // Select 1 or 2 buildings for each user to be destroyed
    const randomAssets = [];
    Object.values(userAssetsMap).forEach((assets) => {
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
        if (!destructionMap[asset.userId]) {
          destructionMap[asset.userId] = {};
        }
        if (!destructionMap[asset.userId][normalizedTitle]) {
          destructionMap[asset.userId][normalizedTitle] = 0;
        }
        destructionMap[asset.userId][normalizedTitle] += 1;
      } else {
        console.log(
          `No building found for asset with buildingId: ${asset.buildingId}`
        );
      }
    });

    // Select a random disaster from the disasters array
    const randomDisasterIndex = Math.floor(Math.random() * disasters.length);
    const randomDisaster = disasters[randomDisasterIndex];

    // Create the disaster response object
    const disasterResponse = Object.entries(destructionMap).map(
      ([userId, destruction]) => ({
        disaster: randomDisaster,
        destruction: destruction,
        userId: userId,
      })
    );

    // Save the disaster in the disasters collection
    const disasterDoc = {
      message: `Destruction caused by ${randomDisaster}`,
      affectedUsersList: disasterResponse,
      destroyedBuildingsCount: randomAssets.length,
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

module.exports = router;
