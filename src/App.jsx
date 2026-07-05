import React, { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  CalendarDays,
  Copy,
  Link,
  RotateCcw,
  Sparkles,
  Trophy,
  
  UserRound,
  Users,
  Clock,
  Pencil,
  Trash2,
  AlertTriangle,
} from "lucide-react";
import { supabase } from "./lib/supabase";

function Card({ children, className = "" }) {
  return <div className={className}>{children}</div>;
}

function CardContent({ children, className = "" }) {
  return <div className={className}>{children}</div>;
}

function Button({ children, className = "", ...props }) {
  return (
    <button
      className={`px-4 py-2 font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

const SLOT_ORDER = ["morning", "afternoon", "evening"];

const SLOT_SEQUENCE = [
  [],
  ["morning"],
  ["morning", "afternoon"],
  ["morning", "afternoon", "evening"],
  ["afternoon", "evening"],
  ["morning", "evening"],
  ["afternoon"],
  ["evening"],
];

const SLOT_LABELS = {
  morning: "Morning",
  afternoon: "Afternoon",
  evening: "Evening",
};

const SLOT_COLORS = {
  morning: "bg-sky-300",
  afternoon: "bg-violet-300",
  evening: "bg-amber-300",
};

function getMeetupIdFromUrl() {
  const parts = window.location.pathname.split("/").filter(Boolean);

  if (parts[0] === "meetup" && parts[1]) {
    return parts[1];
  }

  return "july-meetup";
}

function generateMeetupId() {
  return `meetup-${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeName(name) {
  return String(name || "").trim().toLowerCase();
}

export default function App() {
  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth();

  const [meetupId, setMeetupId] = useState(getMeetupIdFromUrl);
  const [meetupTitle, setMeetupTitle] = useState("");
  const [titleInput, setTitleInput] = useState("");
  const [nameInput, setNameInput] = useState(
    () => localStorage.getItem("friend-calendar-name") || ""
  );
  const [currentPerson, setCurrentPerson] = useState(
    () => localStorage.getItem("friend-calendar-name") || ""
  );
  const [friends, setFriends] = useState([]);
  const [availability, setAvailability] = useState({});
  const [statusMessage, setStatusMessage] = useState("Loading meetup...");
  const [isSaving, setIsSaving] = useState(false);

  const monthName = today.toLocaleString("default", { month: "long" });
  const defaultTitle = `${monthName} Meetup`;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDay = new Date(year, month, 1).getDay();
  const shareUrl = `${window.location.origin}/meetup/${meetupId}`;

  const calendarCells = useMemo(() => {
    const blanks = Array.from({ length: firstDay }, () => null);
    const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);
    return [...blanks, ...days];
  }, [firstDay, daysInMonth]);

  useEffect(() => {
    setupMeetupAndLoadVotes();

    const channel = supabase
      .channel(`meetup-${meetupId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "availability_votes",
          filter: `meetup_id=eq.${meetupId}`,
        },
        () => {
          loadVotes();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [meetupId]);

  function slotsKey(slots) {
    return SLOT_ORDER.filter((slot) => slots.includes(slot)).join("+");
  }

  function getPersonSlots(day, person = currentPerson) {
    const dayVotes = availability[day] || {};
    const cleanPerson = normalizeName(person);

    const matchingName = Object.keys(dayVotes).find(
      (savedName) => normalizeName(savedName) === cleanPerson
    );

    return matchingName ? dayVotes[matchingName] : [];
  }

  function getSlotCount(day, slot) {
    return friends.reduce(
      (count, friend) =>
        count + (getPersonSlots(day, friend).includes(slot) ? 1 : 0),
      0
    );
  }

  function getTotalScore(day) {
    return friends.reduce(
      (sum, friend) => sum + getPersonSlots(day, friend).length,
      0
    );
  }

  function getMaxScore() {
    return Math.max(friends.length * 3, 1);
  }

  function getBestDays() {
    const scored = Array.from({ length: daysInMonth }, (_, i) => {
      const day = i + 1;
      return { day, score: getTotalScore(day) };
    }).sort((a, b) => b.score - a.score);

    return scored.filter((d) => d.score > 0).slice(0, 3);
  }

  function getBestTimeBlocks() {
    const blocks = [];

    for (let day = 1; day <= daysInMonth; day += 1) {
      SLOT_ORDER.forEach((slot) => {
        const count = getSlotCount(day, slot);
        if (count > 0) {
          blocks.push({ day, slot, count });
        }
      });
    }

    return blocks
      .sort((a, b) => b.count - a.count || a.day - b.day)
      .slice(0, 5);
  }

  async function setupMeetupAndLoadVotes() {
    setStatusMessage("Loading meetup...");

    const { data, error } = await supabase
      .from("meetups")
      .select("*")
      .eq("id", meetupId)
      .maybeSingle();

    if (error) {
      console.error("Error loading meetup:", error);
      setStatusMessage(`Could not load meetup: ${error.message}`);
      return;
    }

    if (data) {
      const existingTitle = data.title || defaultTitle;
      setMeetupTitle(existingTitle);
      setTitleInput(existingTitle);
    } else {
      const { error: insertError } = await supabase.from("meetups").insert({
        id: meetupId,
        title: defaultTitle,
        month: month + 1,
        year,
      });

      if (insertError) {
        console.error("Error creating meetup:", insertError);
        setStatusMessage(`Could not create meetup: ${insertError.message}`);
        return;
      }

      setMeetupTitle(defaultTitle);
      setTitleInput(defaultTitle);
    }

    await loadVotes();
  }

  async function loadVotes() {
    const { data, error } = await supabase
      .from("availability_votes")
      .select("*")
      .eq("meetup_id", meetupId);

    if (error) {
      console.error("Error loading votes:", error);
      setStatusMessage(`Could not load votes: ${error.message}`);
      return;
    }

    const nextAvailability = {};
    const nextFriends = new Set();

    data.forEach((vote) => {
      const savedName = String(vote.person_name || "").trim();
      const savedDay = vote.day;

      if (!savedName) return;

      nextFriends.add(savedName);

      if (!nextAvailability[savedDay]) {
        nextAvailability[savedDay] = {};
      }

      nextAvailability[savedDay][savedName] = Array.isArray(vote.slots)
        ? vote.slots
        : [];
    });

    setAvailability(nextAvailability);
    setFriends(Array.from(nextFriends).sort());
    setStatusMessage(`Meetup loaded: ${data.length} saved vote rows.`);
  }

  async function saveVote(day, personName, slots) {
    setIsSaving(true);

    const { error } = await supabase.from("availability_votes").upsert(
      {
        meetup_id: meetupId,
        person_name: personName,
        day,
        slots,
        updated_at: new Date().toISOString(),
      },
      {
        onConflict: "meetup_id,person_name,day",
      }
    );

    setIsSaving(false);

    if (error) {
      console.error("Error saving vote:", error);
      setStatusMessage(`Could not save vote: ${error.message}`);
      return;
    }

    setStatusMessage("Saved. Reloading votes...");
    await loadVotes();
  }

  async function saveMeetupTitle() {
    const cleanTitle = titleInput.trim() || defaultTitle;
    setIsSaving(true);

    const { error } = await supabase
      .from("meetups")
      .update({ title: cleanTitle })
      .eq("id", meetupId);

    setIsSaving(false);

    if (error) {
      console.error("Error saving title:", error);
      setStatusMessage(`Could not save title: ${error.message}`);
      return;
    }

    setMeetupTitle(cleanTitle);
    setStatusMessage("Meetup title saved.");
  }

  async function startVoting() {
    const clean = nameInput.trim();

    if (!clean) {
      setStatusMessage("Enter your name first.");
      return;
    }

    localStorage.setItem("friend-calendar-name", clean);
    setCurrentPerson(clean);
    setFriends((prev) => (prev.includes(clean) ? prev : [...prev, clean].sort()));
    setStatusMessage(`Voting as ${clean}. Reloading saved votes...`);

    await loadVotes();
  }

  async function cycleAvailability(day) {
    if (!currentPerson) {
      setStatusMessage("Enter your name before voting.");
      return;
    }

    const currentSlots = getPersonSlots(day, currentPerson);
    const currentKey = slotsKey(currentSlots);
    const currentIndex = SLOT_SEQUENCE.findIndex(
      (slots) => slotsKey(slots) === currentKey
    );
    const nextIndex =
      currentIndex >= SLOT_SEQUENCE.length - 1 ? 0 : currentIndex + 1;
    const nextSlots = SLOT_SEQUENCE[nextIndex];

    setAvailability((prev) => ({
      ...prev,
      [day]: {
        ...(prev[day] || {}),
        [currentPerson]: nextSlots,
      },
    }));

    await saveVote(day, currentPerson, nextSlots);
  }

  async function resetMyVotes() {
    if (!currentPerson) {
      setStatusMessage("Enter your name first.");
      return;
    }

    const confirmed = window.confirm(
      `Reset all votes for ${currentPerson} on this meetup?`
    );

    if (!confirmed) return;

    setIsSaving(true);

    const { error } = await supabase
      .from("availability_votes")
      .delete()
      .eq("meetup_id", meetupId)
      .eq("person_name", currentPerson);

    setIsSaving(false);

    if (error) {
      console.error("Error resetting votes:", error);
      setStatusMessage(`Could not reset your votes: ${error.message}`);
      return;
    }

    setStatusMessage("Your votes were reset.");
    await loadVotes();
  }

  async function clearMeetupVotes() {
    const confirmed = window.confirm(
      "Clear ALL votes for this meetup? This cannot be undone."
    );

    if (!confirmed) return;

    setIsSaving(true);

    const { error } = await supabase
      .from("availability_votes")
      .delete()
      .eq("meetup_id", meetupId);

    setIsSaving(false);

    if (error) {
      console.error("Error clearing meetup:", error);
      setStatusMessage(`Could not clear meetup votes: ${error.message}`);
      return;
    }

    setAvailability({});
    setFriends([]);
    setStatusMessage("All meetup votes cleared.");
  }

  async function deleteMeetupAndCreateNew() {
    const confirmed = window.confirm(
      "Delete this entire meetup and create a new one? This cannot be undone."
    );

    if (!confirmed) return;

    setIsSaving(true);

    const { error } = await supabase.from("meetups").delete().eq("id", meetupId);

    setIsSaving(false);

    if (error) {
      console.error("Error deleting meetup:", error);
      setStatusMessage(`Could not delete meetup: ${error.message}`);
      return;
    }

    createNewMeetup();
  }

  function copyShareLink() {
    navigator.clipboard.writeText(shareUrl);
    setStatusMessage("Share link copied.");
  }

  function createNewMeetup() {
    const newId = generateMeetupId();
    const newPath = `/meetup/${newId}`;

    window.history.pushState({}, "", newPath);

    setMeetupId(newId);
    setAvailability({});
    setFriends([]);
    setMeetupTitle(defaultTitle);
    setTitleInput(defaultTitle);
    setStatusMessage("New meetup created.");
  }

  function fillLabel(slots) {
    if (!slots.length) return "No availability selected";
    return slots.map((slot) => SLOT_LABELS[slot]).join(", ");
  }

  const bestDays = getBestDays();
  const bestTimeBlocks = getBestTimeBlocks();
  const maxScore = getMaxScore();
  const displayTitle = meetupTitle || defaultTitle;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-indigo-950 to-slate-900 p-4 text-white sm:p-8">
      <div className="mx-auto max-w-6xl">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"
        >
          <div>
            <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-3 py-1 text-sm text-indigo-100 shadow-sm backdrop-blur">
              <CalendarDays className="h-4 w-4" />
              No-login meetup planner
            </div>

            <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
              {displayTitle}
            </h1>

            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300 sm:text-base">
              Share one link. Everyone enters their name, then taps each day to
              pick morning, afternoon, evening, or any combination.
            </p>

            <p className="mt-2 text-xs text-indigo-200">
              {statusMessage} {isSaving ? "Saving..." : ""}
            </p>
          </div>

          <Card className="rounded-3xl border border-white/10 bg-white/10 text-white shadow-2xl backdrop-blur">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-sm font-medium text-indigo-100">
                <Trophy className="h-4 w-4" /> Best days
              </div>

              <div className="mt-2 flex gap-2">
                {bestDays.length ? (
                  bestDays.map(({ day, score }) => (
                    <div
                      key={day}
                      className="rounded-2xl bg-white/10 px-3 py-2 text-center"
                    >
                      <div className="text-lg font-bold">{day}</div>
                      <div className="text-xs text-slate-300">
                        {score}/{maxScore}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-sm text-slate-300">No votes yet</div>
                )}
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <div className="grid gap-5 lg:grid-cols-[330px_1fr]">
          <Card className="rounded-3xl border border-white/10 bg-white/10 text-white shadow-2xl backdrop-blur">
            <CardContent className="space-y-5 p-5">
              <div className="rounded-3xl border border-white/10 bg-slate-950/40 p-4">
                <div className="mb-2 flex items-center gap-2 text-lg font-semibold">
                  <Link className="h-5 w-5 text-indigo-200" /> Share link
                </div>

                <div className="break-all rounded-2xl bg-white/10 p-3 text-xs text-slate-200">
                  {shareUrl}
                </div>

                <div className="mt-3 flex gap-2">
                  <Button
                    onClick={copyShareLink}
                    className="flex flex-1 items-center justify-center rounded-2xl bg-indigo-300 text-sm text-slate-950 hover:bg-indigo-200"
                  >
                    <Copy className="mr-2 h-4 w-4" /> Copy
                  </Button>

                  <Button
                    onClick={createNewMeetup}
                    className="flex flex-1 items-center justify-center rounded-2xl bg-white/10 text-sm text-white hover:bg-white/15"
                  >
                    <Sparkles className="mr-2 h-4 w-4" /> New
                  </Button>
                </div>
              </div>

              <div className="rounded-3xl border border-white/10 bg-slate-950/40 p-4">
                <div className="mb-3 flex items-center gap-2 text-lg font-semibold">
                  <Pencil className="h-5 w-5 text-indigo-200" /> Meetup title
                </div>
                <div className="flex gap-2">
                  <input
                    value={titleInput}
                    onChange={(e) => setTitleInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && saveMeetupTitle()}
                    placeholder="Meetup title"
                    className="min-w-0 flex-1 rounded-2xl border border-white/10 bg-slate-950/50 px-3 py-2 text-sm text-white outline-none ring-indigo-300 transition placeholder:text-slate-500 focus:ring-2"
                  />
                  <Button
                    onClick={saveMeetupTitle}
                    className="rounded-2xl bg-white/10 text-sm text-white hover:bg-white/15"
                  >
                    Save
                  </Button>
                </div>
              </div>

              <div>
                <div className="mb-3 flex items-center gap-2 text-lg font-semibold">
                  <UserRound className="h-5 w-5 text-indigo-200" /> Your name
                </div>

                <div className="flex gap-2">
                  <input
                    value={nameInput}
                    onChange={(e) => setNameInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && startVoting()}
                    placeholder="Enter your name"
                    className="min-w-0 flex-1 rounded-2xl border border-white/10 bg-slate-950/50 px-3 py-2 text-sm text-white outline-none ring-indigo-300 transition placeholder:text-slate-500 focus:ring-2"
                  />

                  <Button
                    onClick={startVoting}
                    className="rounded-2xl bg-indigo-300 text-slate-950 hover:bg-indigo-200"
                  >
                    Start
                  </Button>
                </div>

                {currentPerson && (
                  <div className="mt-3 rounded-2xl bg-indigo-300 px-4 py-3 text-sm font-semibold text-slate-950">
                    Voting as {currentPerson}
                  </div>
                )}
              </div>

              <div className="rounded-2xl bg-slate-950/40 p-4 text-sm text-slate-300">
                <div className="mb-3 font-semibold text-white">Tap cycle</div>
                <div className="space-y-1 leading-6">
                  <div>1 tap = Morning</div>
                  <div>2 taps = Morning + Afternoon</div>
                  <div>3 taps = Morning + Afternoon + Evening</div>
                  <div>4 taps = Afternoon + Evening</div>
                  <div>5 taps = Morning + Evening</div>
                  <div>6 taps = Afternoon only</div>
                  <div>7 taps = Evening only</div>
                  <div>8 taps = Clear</div>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2 text-center text-xs">
                <div className="rounded-2xl bg-sky-300/25 p-2 text-sky-100">
                  Morning
                </div>
                <div className="rounded-2xl bg-violet-300/25 p-2 text-violet-100">
                  Afternoon
                </div>
                <div className="rounded-2xl bg-amber-300/25 p-2 text-amber-100">
                  Evening
                </div>
              </div>

              <div className="rounded-3xl border border-white/10 bg-slate-950/40 p-4">
                <div className="mb-3 flex items-center gap-2 text-lg font-semibold">
                  <Clock className="h-5 w-5 text-indigo-200" /> Best time blocks
                </div>
                <div className="space-y-2 text-sm text-slate-300">
                  {bestTimeBlocks.length ? (
                    bestTimeBlocks.map((block) => (
                      <div
                        key={`${block.day}-${block.slot}`}
                        className="flex items-center justify-between rounded-2xl bg-white/10 px-3 py-2"
                      >
                        <span>
                          {monthName} {block.day}, {SLOT_LABELS[block.slot]}
                        </span>
                        <span className="font-semibold text-white">
                          {block.count}/{friends.length || 1}
                        </span>
                      </div>
                    ))
                  ) : (
                    <div>No time votes yet</div>
                  )}
                </div>
              </div>

              <div className="rounded-3xl border border-white/10 bg-slate-950/40 p-4">
                <div className="mb-3 flex items-center gap-2 text-lg font-semibold">
                  <Users className="h-5 w-5 text-indigo-200" /> Who has voted
                </div>
                <div className="flex flex-wrap gap-2">
                  {friends.length ? (
                    friends.map((friend) => (
                      <span
                        key={friend}
                        className="rounded-full bg-white/10 px-3 py-1 text-xs text-slate-200"
                      >
                        {friend}
                      </span>
                    ))
                  ) : (
                    <span className="text-sm text-slate-400">No voters yet</span>
                  )}
                </div>
              </div>

              <Button
                onClick={resetMyVotes}
                className="w-full rounded-2xl bg-white/10 text-white hover:bg-white/15"
              >
                <RotateCcw className="mr-2 inline h-4 w-4" /> Reset my votes
              </Button>

              <div className="rounded-3xl border border-red-300/20 bg-red-950/20 p-4">
                <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-red-100">
                  <AlertTriangle className="h-4 w-4" /> Admin tools
                </div>
                <div className="grid gap-2">
                  <Button
                    onClick={clearMeetupVotes}
                    className="rounded-2xl bg-red-300/15 text-sm text-red-100 hover:bg-red-300/25"
                  >
                    Clear all votes
                  </Button>
                  <Button
                    onClick={deleteMeetupAndCreateNew}
                    className="rounded-2xl bg-red-400 text-sm text-red-950 hover:bg-red-300"
                  >
                    <Trash2 className="mr-2 inline h-4 w-4" /> Delete meetup
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="overflow-hidden rounded-3xl border border-white/10 bg-white/10 text-white shadow-2xl backdrop-blur">
            <CardContent className="p-4 sm:p-5">
              <div className="mb-4 grid grid-cols-7 gap-2 text-center text-xs font-semibold uppercase tracking-wider text-indigo-100/80">
                {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
                  <div key={d}>{d}</div>
                ))}
              </div>

              <div className="grid grid-cols-7 gap-2">
                {calendarCells.map((day, idx) => {
                  if (!day) {
                    return (
                      <div
                        key={`blank-${idx}`}
                        className="aspect-square rounded-3xl"
                      />
                    );
                  }

                  const mySlots = getPersonSlots(day);
                  const totalScore = getTotalScore(day);
                  const groupPercent = Math.round((totalScore / maxScore) * 100);
                  const isToday = day === today.getDate();

                  return (
                    <motion.button
                      key={day}
                      whileTap={{ scale: 0.96 }}
                      onClick={() => cycleAvailability(day)}
                      aria-label={`Day ${day}, ${fillLabel(
                        mySlots
                      )}, group score ${totalScore} out of ${maxScore}`}
                      className={`relative aspect-square overflow-hidden rounded-3xl border p-2 text-left shadow-lg transition hover:-translate-y-0.5 hover:shadow-indigo-950/40 ${
                        isToday ? "border-indigo-200/80" : "border-white/10"
                      } ${
                        currentPerson
                          ? "bg-slate-950/50"
                          : "cursor-not-allowed bg-slate-950/30 opacity-70"
                      }`}
                    >
                      <div className="absolute inset-0 grid grid-cols-3">
                        {SLOT_ORDER.map((slot) => (
                          <div
                            key={slot}
                            className={`h-full transition-all duration-300 ${
                              mySlots.includes(slot)
                                ? SLOT_COLORS[slot]
                                : "bg-transparent"
                            }`}
                            style={{
                              opacity: mySlots.includes(slot) ? 0.72 : 0,
                            }}
                          />
                        ))}
                      </div>

                      <div
                        className="absolute bottom-0 left-0 h-1.5 bg-emerald-300/80 transition-all duration-300"
                        style={{ width: `${groupPercent}%` }}
                      />

                      <div className="relative z-10 flex h-full flex-col justify-between">
                        <div className="flex items-start justify-between gap-1">
                          <span
                            className={`grid h-8 w-8 place-items-center rounded-full text-sm font-bold ${
                              mySlots.length
                                ? "bg-slate-950/60 text-white"
                                : "bg-white/10 text-slate-200"
                            }`}
                          >
                            {day}
                          </span>

                          {isToday && (
                            <span className="rounded-full bg-white/15 px-2 py-1 text-[10px] text-indigo-100">
                              Today
                            </span>
                          )}
                        </div>

                        <div>
                          <div className="mb-1 grid grid-cols-3 gap-1">
                            {SLOT_ORDER.map((slot) => (
                              <div
                                key={slot}
                                className="rounded-full bg-slate-950/45 px-1 py-0.5 text-center text-[9px] font-semibold text-white"
                              >
                                {getSlotCount(day, slot)}
                              </div>
                            ))}
                          </div>

                          <div className="text-[10px] text-slate-300">
                            M / A / E votes
                          </div>
                        </div>
                      </div>
                    </motion.button>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
