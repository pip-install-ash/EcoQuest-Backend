const express = require("express");
const admin = require("firebase-admin");
const checkAuth = require("../../middleware/authentication");
const createResponse = require("../../utils/helper-functions");

const router = express.Router();

// Post league stats for a user recent maps data
router.post("/", checkAuth, async (req, res) => {
  const {
    leagueId,
    userId,
    lastLogined,
    coins,
    ecoPoints,
    electricity,
    garbage,
    population,
    water,
    gameInitMap,
  } = req.body;

  if (!leagueId || !userId) {
    return res
      .status(400)
      .json(createResponse(false, "Missing leagueId or userId", null));
  }

  try {
    const leagueStatsRef = admin.firestore().collection("leagueStats").doc();
    await leagueStatsRef.set({
      leagueId,
      userId,
      lastLogined,
      coins,
      ecoPoints,
      electricity,
      garbage,
      population,
      water,
      gameInitMap,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    res
      .status(201)
      .json(createResponse(true, "League stats posted successfully", null));
  } catch (error) {
    console.error("Error posting league stats:", error);
    res
      .status(500)
      .json(createResponse(false, "Failed to post league stats", null));
  }
});

router.get("/", checkAuth, async (req, res) => {
  const userID = req.user.user_id;

  if (!userID) {
    return res.status(400).json(createResponse(false, "Missing userID", null));
  }

  try {
    const leagueStatsRef = admin.firestore().collection("leagueStats");
    const snapshot = await leagueStatsRef.where("userId", "==", userID).get();

    if (snapshot.empty) {
      return res
        .status(404)
        .json(
          createResponse(
            false,
            "No league stats found for the given userID",
            null
          )
        );
    }

    const leagueStats = snapshot.docs.map((doc) => ({
      id: doc.id,
      data: doc.data(),
    }));

    res.status(200).json(
      createResponse(true, "League stats retrieved successfully", {
        leagueStats,
      })
    );
  } catch (error) {
    console.error("Error getting league stats:", error);
    res
      .status(500)
      .json(createResponse(false, "Failed to get league stats", null));
  }
});

// Get league stats by userID for resuming the league Game against the login creds of a user.
router.get("/:leagueID", checkAuth, async (req, res) => {
  const { leagueID } = req.params;

  if (!leagueID) {
    return res
      .status(400)
      .json(createResponse(false, "Missing leagueID", null));
  }

  try {
    const leagueStatsRef = admin.firestore().collection("leagueStats");
    const snapshot = await leagueStatsRef
      .where("leagueId", "==", leagueID)
      .get();

    if (snapshot.empty) {
      return res
        .status(404)
        .json(
          createResponse(
            false,
            "No league stats found for the given leagueID",
            null
          )
        );
    }

    const leagueStats = snapshot.docs.map((doc) => ({
      id: doc.id,
      data: doc.data(),
    }));

    // Update the lastLogined field for each document
    const batch = admin.firestore().batch();
    snapshot.docs.forEach((doc) => {
      const docRef = leagueStatsRef.doc(doc.id);
      batch.update(docRef, {
        lastLogined: admin.firestore.FieldValue.serverTimestamp(),
      });
    });
    await batch.commit();

    res.status(200).json(
      createResponse(true, "League stats retrieved successfully", {
        leagueStats,
      })
    );
  } catch (error) {
    console.error("Error getting league stats:", error);
    res
      .status(500)
      .json(createResponse(false, "Failed to get league stats", null));
  }
});

module.exports = router;
