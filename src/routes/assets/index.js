const express = require("express");
const admin = require("firebase-admin");
const checkAuth = require("../../middleware/authentication");
const createResponse = require("../../utils/helper-functions");

const router = express.Router();

// Endpoint to manually calculate user points
router.post(
  "/user/days-based-points-calculation",
  checkAuth,
  async (req, res) => {
    const userId = req.user.user_id;
    const { leagueId, noOfDays } = req.body;

    if (!userId) {
      return res.status(400).json(createResponse(false, "userId is required"));
    }

    try {
      const userAssetsSnapshot = await admin
        .firestore()
        .collection("userAssets")
        .where("userId", "==", userId)
        .where("leagueId", "==", leagueId || "")
        .get();

      const userAssets = userAssetsSnapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));

      const buildingIds = userAssets.map((asset) => asset.buildingId);
      const data = [];

      for (const buildingId of buildingIds) {
        const calculatedPoints = await calculateUserPoints(
          userId,
          buildingId,
          leagueId,
          noOfDays
        );
        data.push(calculatedPoints);
      }

      return res
        .status(200)
        .json(
          createResponse(
            true,
            `User points calculated successfully for ${noOfDays} day(s)`,
            data[buildingIds.length - 1]
          )
        );
    } catch (error) {
      console.error("Error calculating user points:", error);
      return res
        .status(500)
        .json(createResponse(false, "Error calculating user points"));
    }
  }
);

const calculateUserPoints = async (userId, buildingId, leagueId, noOfDays) => {
  try {
    const increaseStats = noOfDays;
    // If noOfDays is not provided, set it to 1
    noOfDays = noOfDays || 1;

    // Fetch building document
    const buildingDoc = await admin
      .firestore()
      .collection("buildings")
      .doc(`${buildingId}`)
      .get();
    const buildData = buildingDoc.data();

    let pointsData;

    if (!leagueId) {
      const userDocRef = admin.firestore().collection("userPoints").doc(userId);
      const userDoc = await userDocRef.get();
      if (!userDoc?.exists) {
        console.error("User document not found");
        return;
      }
      const userPoints = userDoc.data();

      const coinCalculation = increaseStats
        ? (buildData?.earning || 0) * noOfDays +
          (userPoints?.coins - buildData.taxIncome * noOfDays)
        : userPoints?.coins - (buildData.cost + buildData.taxIncome);

      pointsData = {
        coins: coinCalculation,
        ecoPoints:
          userPoints.ecoPoints - (buildData?.ecoPoints || 0) * noOfDays,
        electricity:
          userPoints.electricity - buildData.electricityConsumption * noOfDays,
        garbage: userPoints.garbage + buildData.wasteProduce * noOfDays,
        water: userPoints.water - buildData.waterUsage * noOfDays,
      };

      if (!increaseStats) {
        pointsData.population =
          userPoints.population + buildData.residentCapacity * noOfDays;
      }

      await userDocRef.update(pointsData);
    } else {
      const leagueStatsRef = admin.firestore().collection("leagueStats");
      const leagueStatsDoc = await leagueStatsRef
        .where("leagueId", "==", leagueId)
        .where("userId", "==", userId)
        .limit(1)
        .get();

      if (leagueStatsDoc.empty) {
        console.error("League stats document not found");
        return;
      }

      const leagueStats = leagueStatsDoc.docs[0].data();

      const coinCalculation = increaseStats
        ? (buildData?.earning || 0) * noOfDays +
          (leagueStats?.coins - buildData.taxIncome * noOfDays)
        : leagueStats?.coins - (buildData.cost + buildData.taxIncome);

      pointsData = {
        coins: coinCalculation,
        ecoPoints:
          leagueStats.ecoPoints - (buildData?.ecoPoints || 0) * noOfDays,
        electricity:
          leagueStats.electricity - buildData.electricityConsumption * noOfDays,
        garbage: leagueStats.garbage + buildData.wasteProduce * noOfDays,
        water: leagueStats.water - buildData.waterUsage * noOfDays,
      };

      if (!increaseStats) {
        pointsData.population =
          leagueStats.population + buildData.residentCapacity * noOfDays;
      }

      await leagueStatsDoc.docs[0].ref.update(pointsData);
    }
    return pointsData;
  } catch (error) {
    console.error("Error calculating user points:", error);
  }
};

// Add a new asset to the user (requires authentication)
router.post("/user/assets", checkAuth, async (req, res) => {
  const {
    buildingId,
    isCreated,
    leagueId,
    isForbidden,
    isRotate,
    isDestroyed,
    x,
    y,
  } = req.body;
  if (buildingId === undefined || x === undefined || y === undefined) {
    return res
      .status(500)
      .json(createResponse(false, "All fields are required"));
  }

  const db = admin.firestore();
  const assetRef = db.collection("userAssets").doc();

  const data = {
    buildingId,
    isCreated: isCreated !== undefined ? isCreated : false,
    isForbidden: isForbidden !== undefined ? isForbidden : false,
    isRotate: isRotate !== undefined ? isRotate : false,
    isDestroyed: isDestroyed !== undefined ? isDestroyed : false,
    x,
    y,
    userId: req.user.user_id,
    leagueId: leagueId || "",
    createdAt: new Date().toISOString(),
  };
  const assetId = assetRef.id;

  await handleBuildingCreation(buildingId, req.user.user_id, leagueId);

  assetRef
    .set(data)
    .then(async () => {
      await calculateUserPoints(req.user.user_id, buildingId, leagueId);
      return res
        .status(200)
        .json(createResponse(true, "Asset added to user", { assetId }));
    })
    .catch((error) => {
      console.error("Error adding asset:", error);
      return res.status(500).json(createResponse(false, error.message));
    });
});

// Get all assets for the authenticated user
router.get("/user/assets", checkAuth, (req, res) => {
  const { leagueId } = req.query;
  const db = admin.firestore();
  const assetsRef = db.collection("userAssets");

  assetsRef
    .where("userId", "==", req.user.user_id)
    .where("leagueId", "==", leagueId || "")
    .get()
    .then((snapshot) => {
      if (snapshot.empty) {
        return res.status(404).json(createResponse(false, "No assets found"));
      }

      const assets = [];
      snapshot.forEach((doc) => {
        assets.push({ id: doc.id, ...doc.data() });
      });

      return res
        .status(200)
        .json(createResponse(true, "Assets retrieved successfully", assets));
    })
    .catch((error) => {
      console.error("Error getting assets:", error);
      return res.status(500).json(createResponse(false, error.message));
    });
});

// Delete a specific asset for the authenticated user
router.delete("/user/assets", checkAuth, async (req, res) => {
  const { buildingId, leagueId } = req.body;

  if (buildingId === undefined) {
    return res
      .status(500)
      .json(createResponse(false, "All fields are required"));
  }

  const db = admin.firestore();
  const assetsRef = db.collection("userAssets");

  if (buildingId == 1) {
    await calculateUserPoints(req.user.user_id, buildingId, leagueId);
  }
  // ...(leagueId ? [{ where: ["leagueId", "==", leagueId] }] : [])

  assetsRef
    .where("userId", "==", req.user.user_id)
    .where("buildingId", "==", buildingId)
    .where("leagueId", "==", leagueId || "")
    .limit(1) // Limit to only one document
    .get()
    .then((snapshot) => {
      if (snapshot.empty) {
        return res.status(404).json(createResponse(false, "Asset not found"));
      }

      const doc = snapshot.docs[0];
      return doc.ref.delete().then(async () => {
        return res.status(200).json(createResponse(true, "Asset deleted"));
      });
    })
    .catch((error) => {
      console.error("Error deleting asset:", error);
      return res.status(500).json(createResponse(false, error.message));
    });
});

async function handleBuildingCreation(buildingID, userID, leagueID = null) {
  try {
    // Get all challenges with isEnded: false
    const challengesSnapshot = await admin
      .firestore()
      .collection("challenges")
      .where("isEnded", "==", false)
      .get();

    const challenges = challengesSnapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));
    console.log("Fetched challenges:", challenges);

    // Update isEnded to true for challenges where endTime has passed
    const now = new Date();
    const batch = admin.firestore().batch();
    challenges.forEach((challenge) => {
      if (new Date(challenge.endTime) < now) {
        const challengeRef = admin
          .firestore()
          .collection("challenges")
          .doc(challenge.id);
        batch.update(challengeRef, { isEnded: true });
      }
    });
    await batch.commit();
    console.log("Updated ended challenges");

    // Get active challenges with the provided buildingID
    const activeChallengesSnapshot = await admin
      .firestore()
      .collection("challenges")
      .where("isEnded", "==", false)
      .where(
        "required.buildingID",
        "==",
        typeof buildingID !== "string" ? `${buildingID}` : buildingID
      )
      .get();

    const activeChallenges = activeChallengesSnapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));
    console.log("Fetched active challenges:", activeChallenges);

    if (activeChallenges.length === 0) {
      console.log("No active challenges found for the provided buildingID.");
      return { success: true, message: "No active challenges found" };
    }

    // Process each active challenge
    for (const challenge of activeChallenges) {
      const challengeID = challenge.id;
      const requiredCount = challenge.required.count;
      console.log("Processing challenge:", challengeID);

      // Get the challengeProgress document for the provided userID and challengeID
      const challengeProgressSnapshot = await admin
        .firestore()
        .collection("challengeProgress")
        .where("userID", "==", userID)
        .where("challengeID", "==", challengeID)
        .where("leagueID", "==", leagueID || null)
        .get();

      let challengeProgressDoc;
      if (challengeProgressSnapshot.empty) {
        // Create a new challengeProgress document
        challengeProgressDoc = {
          challengeID,
          userID,
          leagueID: leagueID || null,
          isCompleted: requiredCount === 1,
          progress: {
            buildingID,
            count: 1,
          },
        };
        await admin
          .firestore()
          .collection("challengeProgress")
          .add(challengeProgressDoc);
        console.log(
          "Created new challengeProgress document:",
          challengeProgressDoc
        );
      } else {
        // Update the existing challengeProgress document
        challengeProgressDoc = challengeProgressSnapshot.docs[0];
        if (challengeProgressDoc.data().isCompleted) {
          console.log("Challenge progress is already completed:", challengeID);
          continue;
        }
        const currentCount = challengeProgressDoc.data().progress.count;
        const newCount = currentCount + 1;
        const isCompleted = newCount >= requiredCount;

        await challengeProgressDoc.ref.update({
          "progress.count": newCount,
          isCompleted,
        });
        console.log(
          "Updated challengeProgress document:",
          challengeProgressDoc.id,
          "newCount:",
          newCount,
          "isCompleted:",
          isCompleted
        );
      }

      // Update coins field in userPoints or leagueStats
      if (leagueID) {
        const leagueStatsRef = admin
          .firestore()
          .collection("leagueStats")
          .where("userId", "==", userID)
          .where("leagueId", "==", leagueID);
        const leagueStatsSnapshot = await leagueStatsRef.get();
        console.log("leagueStatsSnapshot size:", leagueStatsSnapshot.size);

        leagueStatsSnapshot.forEach((doc) => {
          console.log("leagueStats document: >>", doc.id, doc.data());
        });

        if (!leagueStatsSnapshot.empty) {
          const leagueStatsDoc = leagueStatsSnapshot.docs[0];

          await leagueStatsDoc.ref.update({
            coins: admin.firestore.FieldValue.increment(200),
          });
          console.log(
            "Updated leagueStats for user:",
            userID,
            "leagueID:",
            leagueID
          );
        } else {
          console.log(
            "No leagueStats document found for user:",
            userID,
            "leagueID:",
            leagueID
          );
        }
      } else {
        console.log("Updating userPoints for user:", userID);
        const userPointsRef = admin
          .firestore()
          .collection("userPoints")
          .doc(userID);
        await userPointsRef.update({
          coins: admin.firestore.FieldValue.increment(200),
        });
        console.log("Updated userPoints for user:", userID);
      }
    }

    return {
      success: true,
      message: "Building creation handled successfully",
    };
  } catch (error) {
    console.error("Error handling building creation:", error);
    return { success: false, message: error.message };
  }
}

module.exports = router;
