const express = require("express");
const admin = require("firebase-admin");
const checkAuth = require("../../middleware/authentication");
const createResponse = require("../../utils/helper-functions");

const router = express.Router();

// Create Points by userID
router.post("/create", checkAuth, async (req, res) => {
  const { userID, ecoPoints, coins, garbage, population, electricity, water } =
    req.body;
  try {
    await admin.firestore().collection("points").doc(userID).set({
      userID,
      ecoPoints,
      coins,
      garbage,
      population,
      electricity,
      water,
    });
    res.status(201).send(createResponse(true, "Points created successfully"));
  } catch (error) {
    res.status(500).send(createResponse(false, "Error creating points"));
  }
});

// Get Points by userID
router.get("/all-points/:userID", checkAuth, async (req, res) => {
  const { userID } = req.params;
  try {
    const doc = await admin.firestore().collection("points").doc(userID).get();
    if (!doc.exists) {
      return res.status(404).send(createResponse(false, "Points not found"));
    }
    res
      .status(200)
      .send(createResponse(true, "Points retrieved successfully", doc.data()));
  } catch (error) {
    res.status(500).send(createResponse(false, "Error getting points"));
  }
});

// Update Points by userID
router.put("/update/:userID", checkAuth, async (req, res) => {
  const { userID } = req.params;
  const { ecoPoints, coins, garbage, population, electricity, water } =
    req.body;

  // Filter out undefined fields
  const updateData = {};
  if (ecoPoints !== undefined) updateData.ecoPoints = ecoPoints;
  if (coins !== undefined) updateData.coins = coins;
  if (garbage !== undefined) updateData.garbage = garbage;
  if (population !== undefined) updateData.population = population;
  if (electricity !== undefined) updateData.electricity = electricity;
  if (water !== undefined) updateData.water = water;

  try {
    await admin.firestore().collection("points").doc(userID).update(updateData);
    res.status(200).send(createResponse(true, "Points updated successfully"));
  } catch (error) {
    console.log("Error: >>", error);
    res.status(500).send(createResponse(false, "Error updating points"));
  }
});

module.exports = router;
