const express = require("express");
const admin = require("firebase-admin");
const checkAuth = require("../../middleware/authentication");
const createResponse = require("../../utils/helper-functions");

const router = express.Router();

// Create building
router.post("/create", checkAuth, async (req, res) => {
  const {
    id,
    title,
    earning,
    cost,
    residentCapacity,
    taxIncome,
    electricityConsumption,
    waterUsage,
    wasteProduce,
  } = req.body;

  if (!id || !title) {
    return res
      .status(400)
      .json(createResponse(false, "ID and title are required"));
  }

  try {
    const buildingData = {
      id,
      title,
      earning,
      cost,
      residentCapacity,
      taxIncome,
      electricityConsumption,
      waterUsage,
      wasteProduce,
    };

    await admin.firestore().collection("buildings").doc(id).set(buildingData);

    return res
      .status(201)
      .json(createResponse(true, "Building created successfully"));
  } catch (error) {
    console.error("Error creating building:", error);
    return res.status(500).json(createResponse(false, "Internal server error"));
  }
});

// Get building by ID
router.get("/:id", checkAuth, async (req, res) => {
  const { id } = req.params;

  try {
    const buildingDoc = await admin
      .firestore()
      .collection("buildings")
      .doc(id)
      .get();

    if (!buildingDoc.exists) {
      return res.status(404).json(createResponse(false, "Building not found"));
    }

    return res
      .status(200)
      .json(
        createResponse(
          true,
          "Building retrieved successfully",
          buildingDoc.data()
        )
      );
  } catch (error) {
    console.error("Error retrieving building:", error);
    return res.status(500).json(createResponse(false, "Internal server error"));
  }
});

module.exports = router;
