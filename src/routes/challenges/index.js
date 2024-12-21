const express = require("express");
const admin = require("firebase-admin");
const checkAuth = require("../../middleware/authentication");
const createResponse = require("../../utils/helper-functions");

const router = express.Router();

const challenges = [
  {
    id: 1,
    description: "Build 4 Residential houses",
    progress: "1/4",
    reward: 200,
  },
  { id: 2, description: "Build a Factory", progress: "0/1", reward: 200 },
  { id: 3, description: "Build a School", progress: "0/1", reward: 200 },
  { id: 4, description: "Build a Hospital", progress: "0/1", reward: 200 },
  { id: 5, description: "Build two Windmills", progress: "0/2", reward: 200 },
];

router.get("/random-challenge", checkAuth, (req, res) => {
  const randomIndex = Math.floor(Math.random() * challenges.length);
  const randomChallenge = challenges[randomIndex];
  res.json(
    createResponse(
      200,
      "Random challenge fetched successfully",
      randomChallenge
    )
  );
});

router.post("/create-challenge", checkAuth, async (req, res) => {
  const { startTime, endTime, leagueID, message, required, points } = req.body;

  if (
    !startTime ||
    !endTime ||
    !message ||
    !required ||
    typeof required !== "object" ||
    !required.buildingID ||
    !required.count ||
    !points
  ) {
    return res
      .status(400)
      .json(createResponse(false, "All fields are required"));
  }

  const newChallenge = {
    startTime,
    endTime,
    leagueID: leagueID || null,
    message,
    required,
    points,
    isEnded: false,
  };

  try {
    if (leagueID) {
      const leagueRef = admin.firestore().collection("leagues").doc(leagueID);
      const leagueDoc = await leagueRef.get();
      if (!leagueDoc.exists) {
        return res
          .status(404)
          .json(
            createResponse(false, `No league found for the id: ${leagueID}`)
          );
      }
    }

    const buildingRef = admin
      .firestore()
      .collection("buildings")
      .doc(required.buildingID);
    const buildingDoc = await buildingRef.get();
    if (!buildingDoc.exists) {
      return res
        .status(404)
        .json(
          createResponse(
            false,
            `No building found for the id: ${required.buildingID}`
          )
        );
    }

    const challengeRef = await admin
      .firestore()
      .collection("challenges")
      .add(newChallenge);

    // Create the notification document
    const notificationDoc = {
      message:
        "New eco challenge! Complete the challenge to get 200 coins reward",
      notificationType: "challenge",
      isGlobal: true,
      userID: null,
    };
    await admin.firestore().collection("notifications").add(notificationDoc);

    res.json(
      createResponse(true, "Challenge created successfully", {
        id: challengeRef.id,
      })
    );
  } catch (error) {
    console.error("Error creating challenge:", error);
    res
      .status(500)
      .json(createResponse(false, "An error occurred", error.message));
  }
});

router.post("/test-building-creation", checkAuth, async (req, res) => {
  const { buildingID, userID, leagueID } = req.body;

  if (!buildingID || !userID) {
    return res
      .status(400)
      .json(createResponse(false, "buildingID and userID are required"));
  }

  try {
    await handleBuildingCreation(buildingID, userID, leagueID);
    res.json(createResponse(true, "Building creation handled successfully"));
  } catch (error) {
    console.error("Error handling building creation:", error);
    res
      .status(500)
      .json(createResponse(false, "An error occurred", error.message));
  }
});

async function handleBuildingCreation(buildingID, userID, leagueID = null) {
  try {
    console.log("Starting handleBuildingCreation function");
    console.log(
      "buildingID:",
      buildingID,
      "userID:",
      userID,
      "leagueID:",
      leagueID
    );

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
      .where("required.buildingID", "==", buildingID)
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
        console.log(
          "Updating leagueStats for user:",
          userID,
          "leagueID:",
          leagueID
        );
        console.log(
          "Querying leagueStats with userId:",
          userID,
          "and leagueId:",
          leagueID
        );
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

    return { success: true, message: "Building creation handled successfully" };
  } catch (error) {
    console.error("Error handling building creation:", error);
    return { success: false, message: error.message };
  }
}

router.post("/create-challenge-progress", checkAuth, async (req, res) => {
  const { challengeID, userID, buildingID, count } = req.body;

  if (!challengeID || !userID || !buildingID || !count) {
    return res
      .status(400)
      .json(createResponse(false, "All fields are required"));
  }

  const challengeProgress = {
    challengeID,
    userID,
    progress: {
      buildingID,
      count,
    },
    isCompleted: false,
  };

  try {
    const challengeRef = admin
      .firestore()
      .collection("challenges")
      .doc(challengeID);
    const challengeDoc = await challengeRef.get();
    if (!challengeDoc.exists) {
      return res
        .status(404)
        .json(
          createResponse(false, `No challenge found for the id: ${challengeID}`)
        );
    }

    await admin
      .firestore()
      .collection("challengeProgress")
      .add(challengeProgress);
    res.json(createResponse(true, "Challenge progress created successfully"));
  } catch (error) {
    console.error("Error creating challenge progress:", error);
    res
      .status(500)
      .json(createResponse(false, "An error occurred", error.message));
  }
});

router.get("/active-challenges", checkAuth, async (req, res) => {
  try {
    const now = new Date();
    const activeChallengesSnapshot = await admin
      .firestore()
      .collection("challenges")
      .where("isEnded", "==", false)
      .get();

    const activeChallenges = activeChallengesSnapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    res.json(
      createResponse(
        true,
        "Active challenges fetched successfully",
        activeChallenges
      )
    );
  } catch (error) {
    console.error("Error fetching active challenges:", error);
    res
      .status(500)
      .json(createResponse(false, "An error occurred", error.message));
  }
});

router.get("/completed-challenges", checkAuth, async (req, res) => {
  const userID = req.user.user_id;
  const { leagueID } = req.query;

  try {
    let query = admin
      .firestore()
      .collection("challengeProgress")
      .where("userID", "==", userID)
      .where("isCompleted", "==", true);

    if (leagueID) {
      query = query.where("leagueID", "==", leagueID);
    } else {
      query = query.where("leagueID", "==", null);
    }

    const completedChallengesSnapshot = await query.get();
    const completedChallenges = completedChallengesSnapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    res.json(
      createResponse(
        true,
        "Completed challenges fetched successfully",
        completedChallenges
      )
    );
  } catch (error) {
    console.error("Error fetching completed challenges:", error);
    res
      .status(500)
      .json(createResponse(false, "An error occurred", error.message));
  }
});

module.exports = router;
