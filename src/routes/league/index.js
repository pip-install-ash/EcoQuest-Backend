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

// Get league by userID
router.get("/get/:userID", checkAuth, async (req, res) => {
  const { userID } = req.params;

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

    res.status(200).json(
      createResponse(true, "League retrieved successfully", {
        id: league.id,
        data: league.data(),
      })
    );
  } catch (error) {
    res.status(500).json(createResponse(false, "Failed to get league", null));
  }
});

// Add user to league
router.post("/add-user-to-league", checkAuth, async (req, res) => {
  const { userID, leagueID } = req.body;

  if (!userID || !leagueID) {
    return res
      .status(400)
      .json(createResponse(false, "Missing userID or leagueID", null));
  }

  try {
    const leagueRef = admin.firestore().collection("leagues").doc(leagueID);
    const leagueDoc = await leagueRef.get();

    if (!leagueDoc.exists) {
      return res
        .status(404)
        .json(
          createResponse(false, "No league found for the given leagueID", null)
        );
    }

    await leagueRef.update({
      userIDs: admin.firestore.FieldValue.arrayUnion(userID),
    });

    res
      .status(200)
      .json(createResponse(true, "User added to league successfully", null));
  } catch (error) {
    res
      .status(500)
      .json(createResponse(false, "Failed to add user to league", null));
  }
});

// Remove user from league
router.post("/remove-user-from-league", checkAuth, async (req, res) => {
  const { userID, leagueID } = req.body;

  if (!userID || !leagueID) {
    return res
      .status(400)
      .json(createResponse(false, "Missing userID or leagueID", null));
  }

  try {
    const leagueRef = admin.firestore().collection("leagues").doc(leagueID);
    const leagueDoc = await leagueRef.get();

    if (!leagueDoc.exists) {
      return res
        .status(404)
        .json(
          createResponse(false, "No league found for the given leagueID", null)
        );
    }

    await leagueRef.update({
      userIDs: admin.firestore.FieldValue.arrayRemove(userID),
    });

    res
      .status(200)
      .json(
        createResponse(true, "User removed from league successfully", null)
      );
  } catch (error) {
    res
      .status(500)
      .json(createResponse(false, "Failed to remove user from league", null));
  }
});

module.exports = router;
