const express = require("express");
const admin = require("firebase-admin");
const checkAuth = require("../../middleware/authentication");
const createResponse = require("../../utils/helper-functions");

/**
 * Sets default statistics values for a league.
 *
 * @param {Object} params - The parameters for setting default stats.
 * @param {string} params.leagueId - The ID of the league.
 * @param {string} params.userId - The ID of the user.
 * @param {string} [params.lastLogined] - The last login time of the user.
 * @param {number} [params.coins=200000] - The number of coins.
 * @param {number} [params.ecoPoints=200] - The number of eco points.
 * @param {number} [params.electricity=200000] - The amount of electricity.
 * @param {number} [params.garbage=0] - The amount of garbage.
 * @param {number} [params.population=0] - The population count.
 * @param {number} [params.water=200] - The amount of water.
 * @param {string} [params.gameInitMap=""] - The initial game map.
 * @returns {Promise<void>} A promise that resolves when the stats are set.
 */
async function setDefaultStatsValue({
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
}) {
  const leagueStatsRef = admin.firestore().collection("leagueStats").doc();
  await leagueStatsRef.set({
    leagueId,
    userId,
    lastLogined: lastLogined || "",
    coins: coins || 200000,
    ecoPoints: ecoPoints || 200,
    electricity: electricity || 200000,
    garbage: garbage || 0,
    population: population || 0,
    water: water || 200,
    gameInitMap: "",
    createdAt: new Date().toISOString(),
  });
}

const router = express.Router();
// Post league stats for a user recent maps data
router.post("/", checkAuth, async (req, res) => {
  const {
    leagueId,
    userId = req.user.user_id,
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
    await setDefaultStatsValue({
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
  const { isGameOn } = req.query;
  console.log("isGame", isGameOn);
  const userID = req.user.user_id;

  if (!leagueID) {
    return res
      .status(400)
      .json(createResponse(false, "Missing leagueID", null));
  }

  try {
    const leagueStatsRef = admin.firestore().collection("leagueStats");
    const snapshot = await leagueStatsRef
      .where("userId", "==", userID)
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
      ...doc.data(),
      id: doc.id,
    }));
    // Get league name from leagues collection
    const leagueRef = admin.firestore().collection("leagues").doc(leagueID);
    const leagueDoc = await leagueRef.get();

    if (!leagueDoc.exists) {
      return res
        .status(404)
        .json(createResponse(false, "League not found", null));
    }

    const leagueName = leagueDoc.data().leagueName;
    // Update the lastLogined field for each document
    const batch = admin.firestore().batch();
    snapshot.docs.forEach((doc) => {
      const docRef = leagueStatsRef.doc(doc.id);
      batch.update(docRef, {
        lastLogined: admin.firestore.FieldValue.serverTimestamp(),
      });
    });
    await batch.commit();

    if (isGameOn === "true") {
      const gameData = {
        userId: leagueStats[0].userId,
        leagueID: leagueStats[0].leagueId,
        lastLogined: leagueStats[0].lastLogined,
        leagueName,
        ecoPoints: leagueStats[0].ecoPoints,
        coins: leagueStats[0].coins,
        garbage: leagueStats[0].garbage,
        electricity: leagueStats[0].electricity,
        water: leagueStats[0].water,
        population: leagueStats[0].population,
      };
      return res
        .status(200)
        .json(
          createResponse(true, "League stats retrieved successfully", gameData)
        );
    }

    res.status(200).json(
      createResponse(
        true,
        "League stats retrieved successfully",
        { leagueStats: { ...leagueStats[0], leagueName } } // we will be having only one league stats for a user
      )
    );
  } catch (error) {
    console.error("Error getting league stats:", error);
    res
      .status(500)
      .json(createResponse(false, "Failed to get league stats", null));
  }
});

router.put("/:leagueID", checkAuth, async (req, res) => {
  const userID = req.user.user_id;
  const { leagueID } = req.params;
  const {
    lastLogined,
    coins,
    ecoPoints,
    electricity,
    garbage,
    population,
    water,
    gameInitMap,
  } = req.body;

  if (!leagueID) {
    return res
      .status(400)
      .json(createResponse(false, "Missing leagueID", null));
  }

  try {
    const leagueStatsRef = admin.firestore().collection("leagueStats");
    const snapshot = await leagueStatsRef
      .where("leagueId", "==", leagueID)
      .where("userId", "==", userID)
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

    const batch = admin.firestore().batch();
    snapshot.docs.forEach((doc) => {
      const docRef = leagueStatsRef.doc(doc.id);
      const updateData = {};
      if (lastLogined !== undefined) updateData.lastLogined = lastLogined;
      if (coins !== undefined) updateData.coins = coins;
      if (ecoPoints !== undefined) updateData.ecoPoints = ecoPoints;
      if (electricity !== undefined) updateData.electricity = electricity;
      if (garbage !== undefined) updateData.garbage = garbage;
      if (population !== undefined) updateData.population = population;
      if (water !== undefined) updateData.water = water;
      if (gameInitMap !== undefined) updateData.gameInitMap = gameInitMap;

      batch.update(docRef, updateData);
    });
    await batch.commit();

    res
      .status(200)
      .json(createResponse(true, "League stats updated successfully", null));
  } catch (error) {
    console.error("Error updating league stats:", error);
    res
      .status(500)
      .json(createResponse(false, "Failed to update league stats", null));
  }
});

module.exports = router;
