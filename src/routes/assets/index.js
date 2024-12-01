const express = require("express");
const admin = require("firebase-admin");
const checkAuth = require("../../middleware/authentication");
const createResponse = require("../../utils/helper-functions");
const e = require("express");

const router = express.Router();

const calculateUserPoints = async (userId, buildingId) => {
  try {
    console.log("Calculating user points", userId, buildingId);
    const buildingDoc = await admin
      .firestore()
      .collection("buildings")
      .doc(`${buildingId}`)
      .get();
    const buildData = buildingDoc.data();

    const userDocRef = admin.firestore().collection("userPoints").doc(userId);
    const userDoc = await userDocRef.get();
    const userPoints = userDoc.data();

    if (!userDoc?.exists) {
      console.error("User document not found");
      return;
    }

    const pointsData = {
      coins:
        userPoints.coins -
        (buildData.cost + buildData.taxIncome) +
        buildData.earning,
      ecoPoints: userPoints.ecoPoints - (buildData?.ecoPoints || 0),
      electricity: userPoints.electricity - buildData.electricityConsumption,
      garbage: userPoints.garbage + buildData.wasteProduce,
      population: userPoints.population + buildData.residentCapacity,
      water: userPoints.water - buildData.waterUsage,
    };

    await userDocRef.update(pointsData);
  } catch (error) {
    console.error("Error calculating user points:", error);
  }
};

// Add a new asset to the user (requires authentication)
router.post("/user/assets", checkAuth, async (req, res) => {
  const { buildingId, isCreated, isForbidden, isRotate, isDestroyed, x, y } =
    req.body;
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
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  };
  const assetId = assetRef.id;

  assetRef
    .set(data)
    .then(async () => {
      await calculateUserPoints(req.user.user_id, buildingId);
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
  const db = admin.firestore();
  const assetsRef = db.collection("userAssets");

  assetsRef
    .where("userId", "==", req.user.user_id)
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
  const { buildingId } = req.body;

  if (buildingId === undefined) {
    return res
      .status(500)
      .json(createResponse(false, "All fields are required"));
  }

  const db = admin.firestore();
  const assetsRef = db.collection("userAssets");

  if (buildingId == 1) {
    await calculateUserPoints(req.user.user_id, buildingId);
  }

  assetsRef
    .where("userId", "==", req.user.user_id)
    .where("buildingId", "==", buildingId)
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

module.exports = router;
