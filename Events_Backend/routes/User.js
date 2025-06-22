const express = require("express");
const mongoose = require("mongoose");
const router = express.Router();
const User = require("../models/User");
const Event = require("../models/event");

router.get("/profile/:id", async function (req, res) {
  try {
    const { id } = req.params;
    const profile = await User.findById(id);
    if (!profile) {
      return res.status(404).send({ error: "Profile not found" });
    }
    res.status(200).send(profile);
  } catch (error) {
    console.error("Error fetching profile:", error);
    res.status(500).send({ error: "Internal Server Error" });
  }
});

router.get("/profile/google/:id", async function (req, res) {
  try {
    const { id } = req.params;
    const profile = await User.findOne({ googleId: id });
    if (!profile) {
      return res.status(404).send({ error: "Profile not found" });
    }
    res.status(200).send(profile);
  } catch (error) {
    console.error("Error fetching profile:", error);
    res.status(500).send({ error: "Internal Server Error" });
  }
});

router.put("/profile/:id", function (req, res) {
  user
    .findByIdAndUpdate(req.params.id, req.body, { new: true })
    .then((err, user) => {
      if (err) return res.status(500).send(err);
      res.json(user);
    });
});

router.post("/register-event", async (req, res) => {
  try {
    const { userid, eventId, leadInfo, isTeam, teamName, members, isPaid, amount } = req.body;

    if (!userid || !eventId) {
      return res.status(400).json({ error: "Missing userid or event ID" });
    }

    if (!leadInfo || !leadInfo.name || !leadInfo.email || !leadInfo.phone) {
      return res.status(400).json({ error: "Missing lead info" });
    }

    // Check if user exists
    const user = await User.findById(userid);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Check if user is already registered
    if (user.events.includes(eventId)) {
      return res.status(400).json({ error: "User already registered for this event" });
    }

    // Prepare participant data
    const participantData = {
      lead: userid,
      lead_name: leadInfo.name,
      lead_email: leadInfo.email,
      lead_phone: leadInfo.phone,
      lead_profilePic: user.profilePic || null,
    };

    if (isTeam) {
      participantData.registrationData = {
        teamName,
        members: members || []
      };
    }

    // Update user and event in a transaction
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      // Update user's events
      const updatedUser = await User.findByIdAndUpdate(
        userid,
        { $addToSet: { events: eventId } },
        { new: true, session }
      );

      // Update event's participants
      const updatedEvent = await Event.findByIdAndUpdate(
        eventId,
        { $addToSet: { participants: participantData } },
        { new: true, session }
      );

      await session.commitTransaction();
      session.endSession();

      res.status(200).json({
        message: "Registration successful",
        user: updatedUser,
        event: updatedEvent
      });
    } catch (error) {
      await session.abortTransaction();
      session.endSession();
      throw error;
    }
  } catch (error) {
    console.error("Registration error:", error);
    res.status(500).json({ 
      error: "Internal Server Error", 
      details: error.message 
    });
  }
});

router.post("/unregister-event", async (req, res) => {
  try {
    const userid = req.body?.userid;
    const eventId = req.body?.eventId;

    if (!userid || !eventId) {
      return res.status(400).json({ error: "Missing userid or event ID" });
    }

    const updatedUser = await User.findByIdAndUpdate(
      userid,
      { $pull: { events: eventId } },
      { new: true }
    );

    if (!updatedUser) {
      return res.status(404).json({ error: "User not found" });
    }

    const updatedEvent = await Event.findByIdAndUpdate(
      eventId,
      { $pull: { participants: { lead: userid } } },
      { new: true }
    );

    if (!updatedEvent) {
      return res.status(404).json({ error: "Event not found" });
    }

    res.status(200).json({
      message: "User unregistered from the event successfully",
      user: updatedUser,
      event: updatedEvent,
    });
  } catch (error) {
    res
      .status(500)
      .json({ error: "Internal Server Error", details: error.message });
  }
});

router.get("/check-registration-status", async (req, res) => {
  try {
    const userid = req.query.userid;
    const eventId = req.query.eventId;

    if (!userid || !eventId) {
      return res.status(400).json({ error: "Missing userid or event ID" });
    }

    const user = await User.findById(userid);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Check if the user is registered for the event
    const isRegistered = user.events.includes(eventId);

    res.status(200).json({ isRegistered });
  } catch (error) {
    res
      .status(500)
      .json({ error: "Internal Server Error", details: error.message });
  }
});

router.post("/add-comment/:id", async (req, res) => {
  const { user, name, rating, comment } = req.body;
  const { id } = req.params;

  if (!user || !name || !rating || !comment) {
    return res.status(400).json({ error: "All fields are required" });
  }

  if (rating < 1 || rating > 5) {
    return res.status(400).json({ error: "Rating must be between 1 and 5" });
  }

  try {
    const item = await Event.findById(id);

    if (!item) {
      return res.status(404).json({ error: "Item not found" });
    }

    const newComment = {
      user,
      name,
      rating,
      comment,
      createdAt: new Date(),
    };

    item.ratings.push(newComment);
    await item.save();

    res
      .status(201)
      .json({ message: "Comment added successfully", ratings: item.ratings });
  } catch (error) {
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.delete("/delete-comment/:id/:commentId", async (req, res) => {
  const { id, commentId } = req.params;
  const { userId } = req.body; // Assuming the user ID of the request sender is sent in the request body

  try {
    const item = await Event.findById(id);

    if (!item) {
      return res.status(404).json({ error: "Item not found" });
    }

    const commentIndex = item.ratings.findIndex(
      (rating) => rating._id.toString() === commentId
    );

    if (commentIndex === -1) {
      return res.status(404).json({ error: "Comment not found" });
    }

    const comment = item.ratings[commentIndex];

    if (comment.user.toString() !== userId) {
      return res
        .status(403)
        .json({ error: "You are not authorized to delete this comment" });
    }

    item.ratings.splice(commentIndex, 1);
    await item.save();

    res
      .status(200)
      .json({ message: "Comment deleted successfully", ratings: item.ratings });
  } catch (error) {
    res.status(500).json({ error: "Internal Server Error" });
  }
});

module.exports = router;
