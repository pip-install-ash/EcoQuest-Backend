const express = require("express");
const admin = require("firebase-admin");
const checkAuth = require("../../middleware/authentication");
const createResponse = require("../../utils/helper-functions");

const router = express.Router();

// Create league
router.post("/create", checkAuth, async (req, res) => {
  const { userIDs, createdBy } = req.body;

  if (!userIDs || !createdBy) {
    return res
      .status(400)
      .json(createResponse(false, "Missing required fields", null));
  }

  try {
    const leagueRef = await admin.firestore().collection("leagues").add({
      userIDs,
      createdBy,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    res.status(201).json(
      createResponse(true, "League created successfully", {
        id: leagueRef.id,
      })
    );
  } catch (error) {
    res
      .status(500)
      .json(createResponse(false, "Failed to create league", null));
  }
});

// Get and update league by userID
router.post("/get-update/:userID", checkAuth, async (req, res) => {
  const { userID } = req.params;
  const { updateData } = req.body;

  if (!userID) {
    return res.status(400).json(createResponse(false, "Missing userID", null));
  }

  try {
    const leaguesRef = admin.firestore().collection("leagues");
    const snapshot = await leaguesRef
      .where("userIDs", "array-contains", userID)
      .get();

    if (snapshot.empty) {
      return res
        .status(404)
        .json(
          createResponse(false, "No league found for the given userID", null)
        );
    }

    const league = snapshot.docs[0];
    if (updateData) {
      await league.ref.update(updateData);
    }

    res.status(200).json(
      createResponse(true, "League retrieved and updated successfully", {
        id: league.id,
        data: league.data(),
      })
    );
  } catch (error) {
    res
      .status(500)
      .json(createResponse(false, "Failed to get or update league", null));
  }
});

module.exports = router;
