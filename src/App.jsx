import React, { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  AlertTriangle,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock,
  Copy,
  Download,
  Link,
  Lock,
  LogOut,
  MessageCircle,
  Pencil,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Trash2,
  Trophy,
  UserRound,
  Users,
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

const ADMIN_STORAGE_KEY = "friend-calendar-owner-mode";
const OWNER_CODE = import.meta.env.VITE_OWNER_CODE || "change-me";

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

function getOwnerModeFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const ownerCodeFromUrl = params.get("owner");

  if (ownerCodeFromUrl && ownerCodeFromUrl === OWNER_CODE) {
    localStorage.setItem(ADMIN_STORAGE_KEY, "true");

    const cleanUrl = `${window.location.origin}${window.location.pathname}`;
    window.history.replaceState({}, "", cleanUrl);

    return true;
  }

  return localStorage.getItem(ADMIN_STORAGE_KEY) === "true";
}

function buildMonthOptions() {
  const now = new Date();
  return Array.from({ length: 12 }, (_, index) => {
    const date = new Date(now.getFullYear(), now.getMonth() + index, 1);
    return {
      label: date.toLocaleString("default", { month: "long", year: "numeric" }),
      month: date.getMonth(),
      year: date.getFullYear(),
      value: `${date.getFullYear()}-${date.getMonth()}`,
    };
  });
}

export default function App() {
  const today = new Date();
  const currentYear = today.getFullYear();
  const currentMonth = today.getMonth();

  const [meetupId, setMeetupId] = useState(getMeetupIdFromUrl);
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [selectedMonth, setSelectedMonth] = useState(currentMonth);
  const [meetupTitle, setMeetupTitle] = useState("");
  const [titleInput, setTitleInput] = useState("");
  const [invitedInput, setInvitedInput] = useState("");
  const [invitedFriends, setInvitedFriends] = useState([]);
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
  const [isOwner, setIsOwner] = useState(getOwnerModeFromUrl);
  const [ownerCodeInput, setOwnerCodeInput] = useState("");

  const monthOptions = useMemo(() => buildMonthOptions(), []);
  const monthName = new Date(selectedYear, selectedMonth, 1).toLocaleString("default", {
    month: "long",
  });
  const monthYearLabel = new Date(selectedYear, selectedMonth, 1).toLocaleString("default", {
    month: "long",
    year: "numeric",
  });
  const defaultTitle = `${monthName} Meetup`;
  const daysInMonth = new Date(selectedYear, selectedMonth + 1, 0).getDate();
  const firstDay = new Date(selectedYear, selectedMonth, 1).getDay();
  const shareUrl = `${window.location.origin}/meetup/${meetupId}`;
  const ownerUrl = `${shareUrl}?owner=${OWNER_CODE}`;
  const isCurrentCalendarMonth = selectedYear === currentYear && selectedMonth === currentMonth;

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

  function getSlotVoters(day, slot) {
    return friends.filter((friend) => getPersonSlots(day, friend).includes(slot));
  }

  function getSlotCount(day, slot) {
    return getSlotVoters(day, slot).length;
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

  function getBestTimeBlocks(limit = 5) {
    const blocks = [];

    for (let day = 1; day <= daysInMonth; day += 1) {
      SLOT_ORDER.forEach((slot) => {
        const voters = getSlotVoters(day, slot);
        if (voters.length > 0) {
          blocks.push({ day, slot, count: voters.length, voters });
        }
      });
    }

    return blocks
      .sort((a, b) => b.count - a.count || a.day - b.day)
      .slice(0, limit);
  }

  function getMissingVoters() {
    if (!invitedFriends.length) return [];

    const votedNames = new Set(friends.map((friend) => normalizeName(friend)));
    return invitedFriends.filter((friend) => !votedNames.has(normalizeName(friend)));
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
      const existingMonth = Number.isInteger(data.month) ? data.month - 1 : currentMonth;
      const existingYear = Number.isInteger(data.year) ? data.year : currentYear;
      const existingTitle = data.title || new Date(existingYear, existingMonth, 1).toLocaleString("default", {
        month: "long",
      }) + " Meetup";
      const existingInvited = Array.isArray(data.invited_names) ? data.invited_names : [];

      setSelectedMonth(existingMonth);
      setSelectedYear(existingYear);
      setMeetupTitle(existingTitle);
      setTitleInput(existingTitle);
      setInvitedFriends(existingInvited);
      setInvitedInput(existingInvited.join("\n"));
    } else {
      const { error: insertError } = await supabase.from("meetups").insert({
        id: meetupId,
        title: defaultTitle,
        month: selectedMonth + 1,
        year: selectedYear,
        invited_names: [],
      });

      if (insertError) {
        console.error("Error creating meetup:", insertError);
        setStatusMessage(`Could not create meetup: ${insertError.message}`);
        return;
      }

      setMeetupTitle(defaultTitle);
      setTitleInput(defaultTitle);
      setInvitedFriends([]);
      setInvitedInput("");
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
    if (!isOwner) {
      setStatusMessage("Owner mode required to edit the meetup title.");
      return;
    }

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

  async function saveInvitedFriends() {
    if (!isOwner) {
      setStatusMessage("Owner mode required to edit invited friends.");
      return;
    }

    const nextInvited = invitedInput
      .split(/\n|,/)
      .map((name) => name.trim())
      .filter(Boolean);

    const uniqueInvited = Array.from(new Map(nextInvited.map((name) => [normalizeName(name), name])).values());

    setIsSaving(true);

    const { error } = await supabase
      .from("meetups")
      .update({ invited_names: uniqueInvited })
      .eq("id", meetupId);

    setIsSaving(false);

    if (error) {
      console.error("Error saving invited friends:", error);
      setStatusMessage(`Could not save invited list: ${error.message}`);
      return;
    }

    setInvitedFriends(uniqueInvited);
    setInvitedInput(uniqueInvited.join("\n"));
    setStatusMessage("Invited friend list saved.");
  }

  async function saveMeetupMonth(nextMonth, nextYear) {
    if (!isOwner) {
      setStatusMessage("Owner mode required to change the meetup month.");
      return;
    }

    setSelectedMonth(nextMonth);
    setSelectedYear(nextYear);
    setIsSaving(true);

    const { error } = await supabase
      .from("meetups")
      .update({ month: nextMonth + 1, year: nextYear })
      .eq("id", meetupId);

    setIsSaving(false);

    if (error) {
      console.error("Error saving month:", error);
      setStatusMessage(`Could not save month: ${error.message}`);
      return;
    }

    setStatusMessage("Meetup month saved.");
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
    if (!isOwner) {
      setStatusMessage("Owner mode required to clear all votes.");
      return;
    }

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
    if (!isOwner) {
      setStatusMessage("Owner mode required to delete this meetup.");
      return;
    }

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
    setStatusMessage("Friend share link copied.");
  }

  function copyOwnerLink() {
    navigator.clipboard.writeText(ownerUrl);
    setStatusMessage("Owner link copied. Do not share this with friends.");
  }

  function textInvite() {
    const message = `Pick your availability for ${meetupTitle || defaultTitle}: ${shareUrl}`;
    window.location.href = `sms:?&body=${encodeURIComponent(message)}`;
  }

  function getResultsText() {
    const bestBlocks = getBestTimeBlocks(10);
    const missingVoters = getMissingVoters();

    const lines = [
      `${meetupTitle || defaultTitle} Availability Results`,
      `Link: ${shareUrl}`,
      "",
      "Best exact options:",
      bestBlocks.length
        ? bestBlocks
            .map(
              (block, index) =>
                `${index + 1}. ${monthName} ${block.day}, ${SLOT_LABELS[block.slot]} - ${block.count}/${friends.length || 1} available (${block.voters.join(", ")})`
            )
            .join("\n")
        : "No votes yet.",
      "",
      `Voted: ${friends.length ? friends.join(", ") : "No voters yet"}`,
      invitedFriends.length
        ? `Still waiting on: ${missingVoters.length ? missingVoters.join(", ") : "Nobody - everyone on the invited list has voted"}`
        : "Invited list not set.",
    ];

    return lines.join("\n");
  }

  function copyResults() {
    navigator.clipboard.writeText(getResultsText());
    setStatusMessage("Results copied for texting or posting in chat.");
  }

  function createNewMeetup() {
    if (!isOwner) {
      setStatusMessage("Owner mode required to create a new meetup from this page.");
      return;
    }

    const newId = generateMeetupId();
    const newPath = `/meetup/${newId}`;

    window.history.pushState({}, "", newPath);

    setMeetupId(newId);
    setAvailability({});
    setFriends([]);
    setMeetupTitle(defaultTitle);
    setTitleInput(defaultTitle);
    setInvitedFriends([]);
    setInvitedInput("");
    setStatusMessage("New meetup created.");
  }

  function unlockOwnerMode() {
    if (ownerCodeInput.trim() === OWNER_CODE) {
      localStorage.setItem(ADMIN_STORAGE_KEY, "true");
      setIsOwner(true);
      setOwnerCodeInput("");
      setStatusMessage("Owner mode unlocked on this device.");
    } else {
      setStatusMessage("Incorrect owner code.");
    }
  }

  function leaveOwnerMode() {
    localStorage.removeItem(ADMIN_STORAGE_KEY);
    setIsOwner(false);
    setStatusMessage("Owner mode hidden on this device.");
  }

  function fillLabel(slots) {
    if (!slots.length) return "No availability selected";
    return slots.map((slot) => SLOT_LABELS[slot]).join(", ");
  }

  const bestDays = getBestDays();
  const bestTimeBlocks = getBestTimeBlocks();
  const bestExactOption = bestTimeBlocks[0];
  const missingVoters = getMissingVoters();
  const maxScore = getMaxScore();
  const displayTitle = meetupTitle || defaultTitle;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-indigo-950 to-slate-900 p-3 text-white sm:p-8">
      <div className="mx-auto max-w-6xl">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="mb-5 flex flex-col gap-4 sm:mb-6 sm:flex-row sm:items-end sm:justify-between"
        >
          <div>
            <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-3 py-1 text-xs text-indigo-100 shadow-sm backdrop-blur sm:text-sm">
              <CalendarDays className="h-4 w-4" />
              No-login meetup planner
            </div>

            <h1 className="text-3xl font-semibold tracking-tight sm:text-5xl">
              {displayTitle}
            </h1>

            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300 sm:text-base">
              Enter your name, then tap each day to pick morning, afternoon,
              evening, or any combination.
            </p>

            <p className="mt-2 text-xs text-indigo-200">
              {statusMessage} {isSaving ? "Saving..." : ""}
            </p>
          </div>

          <Card className="rounded-3xl border border-emerald-300/20 bg-emerald-950/25 text-white shadow-2xl backdrop-blur">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-sm font-medium text-emerald-100">
                <Trophy className="h-4 w-4" /> Best exact option
              </div>

              {bestExactOption ? (
                <div className="mt-2">
                  <div className="text-xl font-bold">
                    {monthName} {bestExactOption.day}, {SLOT_LABELS[bestExactOption.slot]}
                  </div>
                  <div className="mt-1 text-sm text-emerald-100">
                    {bestExactOption.count}/{friends.length || 1} available
                  </div>
                  <div className="mt-2 text-xs text-slate-300">
                    {bestExactOption.voters.join(", ")}
                  </div>
                </div>
              ) : (
                <div className="mt-2 text-sm text-slate-300">No votes yet</div>
              )}
            </CardContent>
          </Card>
        </motion.div>

        <div className="grid gap-5 lg:grid-cols-[340px_1fr]">
          <Card className="rounded-3xl border border-white/10 bg-white/10 text-white shadow-2xl backdrop-blur">
            <CardContent className="space-y-5 p-4 sm:p-5">
              {isOwner ? (
                <div className="rounded-3xl border border-emerald-300/20 bg-emerald-950/20 p-4">
                  <div className="mb-2 flex items-center gap-2 text-lg font-semibold text-emerald-100">
                    <ShieldCheck className="h-5 w-5" /> Owner controls
                  </div>

                  <div className="mb-3 rounded-2xl bg-white/10 p-3 text-xs text-slate-200">
                    <div className="mb-1 font-semibold text-white">Friend link</div>
                    <div className="break-all">{shareUrl}</div>
                  </div>

                  <div className="grid gap-2 sm:grid-cols-2">
                    <Button
                      onClick={copyShareLink}
                      className="flex items-center justify-center rounded-2xl bg-indigo-300 text-sm text-slate-950 hover:bg-indigo-200"
                    >
                      <Copy className="mr-2 h-4 w-4" /> Copy link
                    </Button>
                    <Button
                      onClick={textInvite}
                      className="flex items-center justify-center rounded-2xl bg-sky-300 text-sm text-sky-950 hover:bg-sky-200"
                    >
                      <MessageCircle className="mr-2 h-4 w-4" /> Text invite
                    </Button>
                    <Button
                      onClick={copyResults}
                      className="flex items-center justify-center rounded-2xl bg-violet-300 text-sm text-violet-950 hover:bg-violet-200"
                    >
                      <Download className="mr-2 h-4 w-4" /> Copy results
                    </Button>
                    <Button
                      onClick={copyOwnerLink}
                      className="flex items-center justify-center rounded-2xl bg-emerald-300 text-sm text-emerald-950 hover:bg-emerald-200"
                    >
                      <ShieldCheck className="mr-2 h-4 w-4" /> Owner link
                    </Button>
                  </div>

                  <Button
                    onClick={leaveOwnerMode}
                    className="mt-3 w-full rounded-2xl bg-white/10 text-sm text-white hover:bg-white/15"
                  >
                    <LogOut className="mr-2 inline h-4 w-4" /> Hide owner controls
                  </Button>
                </div>
              ) : (
                <div className="rounded-3xl border border-white/10 bg-slate-950/40 p-4">
                  <div className="mb-3 flex items-center gap-2 text-lg font-semibold">
                    <Lock className="h-5 w-5 text-indigo-200" /> Owner access
                  </div>
                  <p className="mb-3 text-sm text-slate-400">
                    Friends can vote only. Enter the owner code to show owner tools on this device.
                  </p>
                  <div className="flex gap-2">
                    <input
                      value={ownerCodeInput}
                      onChange={(e) => setOwnerCodeInput(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && unlockOwnerMode()}
                      placeholder="Owner code"
                      type="password"
                      className="min-w-0 flex-1 rounded-2xl border border-white/10 bg-slate-950/50 px-3 py-2 text-sm text-white outline-none ring-indigo-300 transition placeholder:text-slate-500 focus:ring-2"
                    />
                    <Button
                      onClick={unlockOwnerMode}
                      className="rounded-2xl bg-white/10 text-sm text-white hover:bg-white/15"
                    >
                      Unlock
                    </Button>
                  </div>
                </div>
              )}

              {isOwner && (
                <div className="rounded-3xl border border-white/10 bg-slate-950/40 p-4">
                  <div className="mb-3 flex items-center gap-2 text-lg font-semibold">
                    <Pencil className="h-5 w-5 text-indigo-200" /> Meetup setup
                  </div>

                  <div className="space-y-3">
                    <div>
                      <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-400">
                        Meetup title
                      </label>
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
                      <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-400">
                        Calendar month
                      </label>
                      <select
                        value={`${selectedYear}-${selectedMonth}`}
                        onChange={(e) => {
                          const option = monthOptions.find((item) => item.value === e.target.value);
                          if (option) saveMeetupMonth(option.month, option.year);
                        }}
                        className="w-full rounded-2xl border border-white/10 bg-slate-950/60 px-3 py-2 text-sm text-white outline-none ring-indigo-300 focus:ring-2"
                      >
                        {monthOptions.map((option) => (
                          <option key={option.value} value={option.value} className="bg-slate-950 text-white">
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              )}

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

              <div className="rounded-2xl bg-slate-950/40 p-4 text-sm text-slate-300 sm:hidden">
                <div className="mb-2 font-semibold text-white">Quick guide</div>
                <div>Tap a day to cycle through Morning, Afternoon, Evening combinations.</div>
              </div>

              <div className="hidden rounded-2xl bg-slate-950/40 p-4 text-sm text-slate-300 sm:block">
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
                  <Clock className="h-5 w-5 text-indigo-200" /> Best exact options
                </div>
                <div className="space-y-2 text-sm text-slate-300">
                  {bestTimeBlocks.length ? (
                    bestTimeBlocks.map((block, index) => (
                      <div
                        key={`${block.day}-${block.slot}`}
                        className={`rounded-2xl px-3 py-2 ${index === 0 ? "bg-emerald-300/20 ring-1 ring-emerald-300/30" : "bg-white/10"}`}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <span className="font-semibold text-white">
                            {monthName} {block.day}, {SLOT_LABELS[block.slot]}
                          </span>
                          <span className="shrink-0 font-semibold text-white">
                            {block.count}/{friends.length || 1}
                          </span>
                        </div>
                        <div className="mt-1 text-xs text-slate-300">
                          {block.voters.join(", ")}
                        </div>
                      </div>
                    ))
                  ) : (
                    <div>No time votes yet</div>
                  )}
                </div>
              </div>

              {isOwner && (
                <div className="rounded-3xl border border-white/10 bg-slate-950/40 p-4">
                  <div className="mb-3 flex items-center gap-2 text-lg font-semibold">
                    <Users className="h-5 w-5 text-indigo-200" /> Invited friends
                  </div>
                  <textarea
                    value={invitedInput}
                    onChange={(e) => setInvitedInput(e.target.value)}
                    placeholder="One friend per line, or comma-separated"
                    rows={4}
                    className="w-full rounded-2xl border border-white/10 bg-slate-950/50 px-3 py-2 text-sm text-white outline-none ring-indigo-300 transition placeholder:text-slate-500 focus:ring-2"
                  />
                  <Button
                    onClick={saveInvitedFriends}
                    className="mt-2 w-full rounded-2xl bg-white/10 text-sm text-white hover:bg-white/15"
                  >
                    Save invited list
                  </Button>
                </div>
              )}

              <div className="rounded-3xl border border-white/10 bg-slate-950/40 p-4">
                <div className="mb-3 flex items-center gap-2 text-lg font-semibold">
                  <Users className="h-5 w-5 text-indigo-200" /> Voting status
                </div>
                <div className="space-y-3">
                  <div>
                    <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                      Who has voted
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

                  <div>
                    <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                      Still waiting on
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {invitedFriends.length ? (
                        missingVoters.length ? (
                          missingVoters.map((friend) => (
                            <span
                              key={friend}
                              className="rounded-full bg-amber-300/15 px-3 py-1 text-xs text-amber-100"
                            >
                              {friend}
                            </span>
                          ))
                        ) : (
                          <span className="rounded-full bg-emerald-300/15 px-3 py-1 text-xs text-emerald-100">
                            Everyone invited has voted
                          </span>
                        )
                      ) : (
                        <span className="text-sm text-slate-400">Owner can add an invited list</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <Button
                onClick={resetMyVotes}
                className="w-full rounded-2xl bg-white/10 text-white hover:bg-white/15"
              >
                <RotateCcw className="mr-2 inline h-4 w-4" /> Reset my votes
              </Button>

              {isOwner && (
                <div className="rounded-3xl border border-red-300/20 bg-red-950/20 p-4">
                  <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-red-100">
                    <AlertTriangle className="h-4 w-4" /> Admin tools
                  </div>
                  <div className="mb-3 flex gap-2">
                    <Button
                      onClick={createNewMeetup}
                      className="flex flex-1 items-center justify-center rounded-2xl bg-white/10 text-sm text-white hover:bg-white/15"
                    >
                      <Sparkles className="mr-2 h-4 w-4" /> New meetup
                    </Button>
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
              )}
            </CardContent>
          </Card>

          <Card className="overflow-hidden rounded-3xl border border-white/10 bg-white/10 text-white shadow-2xl backdrop-blur">
            <CardContent className="p-3 sm:p-5">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <div className="text-lg font-semibold">{monthYearLabel}</div>
                  <div className="text-xs text-slate-400">Morning / Afternoon / Evening</div>
                </div>
                <div className="hidden gap-1 sm:flex">
                  <ChevronLeft className="h-5 w-5 text-slate-500" />
                  <ChevronRight className="h-5 w-5 text-slate-500" />
                </div>
              </div>

              <div className="mb-3 grid grid-cols-7 gap-1 text-center text-[10px] font-semibold uppercase tracking-wider text-indigo-100/80 sm:mb-4 sm:gap-2 sm:text-xs">
                {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
                  <div key={d}>{d}</div>
                ))}
              </div>

              <div className="grid grid-cols-7 gap-1 sm:gap-2">
                {calendarCells.map((day, idx) => {
                  if (!day) {
                    return (
                      <div
                        key={`blank-${idx}`}
                        className="min-h-[70px] rounded-3xl sm:aspect-square sm:min-h-0"
                      />
                    );
                  }

                  const mySlots = getPersonSlots(day);
                  const totalScore = getTotalScore(day);
                  const groupPercent = Math.round((totalScore / maxScore) * 100);
                  const isToday = isCurrentCalendarMonth && day === today.getDate();

                  return (
                    <div key={day} className="relative pt-5 sm:pt-6">
                      {isToday && (
                        <div className="absolute left-1/2 top-0 -translate-x-1/2 rounded-full bg-emerald-300 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-emerald-950 shadow-sm">
                          Today
                        </div>
                      )}

                      <motion.button
                        whileTap={{ scale: 0.96 }}
                        onClick={() => cycleAvailability(day)}
                        aria-label={`Day ${day}, ${fillLabel(
                          mySlots
                        )}, group score ${totalScore} out of ${maxScore}`}
                        className={`relative min-h-[70px] w-full overflow-hidden rounded-2xl border p-1.5 text-left shadow-lg transition hover:-translate-y-0.5 hover:shadow-indigo-950/40 sm:aspect-square sm:min-h-0 sm:rounded-3xl sm:p-2 ${
                          isToday ? "border-emerald-300/80" : "border-white/10"
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
                          className="absolute bottom-0 left-0 h-1 bg-emerald-300/80 transition-all duration-300 sm:h-1.5"
                          style={{ width: `${groupPercent}%` }}
                        />

                        <div className="relative z-10 flex h-full min-h-[58px] flex-col justify-between sm:min-h-0">
                          <div className="flex items-start justify-between gap-1">
                            <span
                              className={`grid h-7 w-7 place-items-center rounded-full text-xs font-bold sm:h-8 sm:w-8 sm:text-sm ${
                                mySlots.length
                                  ? "bg-slate-950/60 text-white"
                                  : "bg-white/10 text-slate-200"
                              }`}
                            >
                              {day}
                            </span>
                          </div>

                          <div>
                            <div className="mb-1 grid grid-cols-3 gap-0.5 sm:gap-1">
                              {SLOT_ORDER.map((slot) => (
                                <div
                                  key={slot}
                                  className="rounded-full bg-slate-950/45 px-0.5 py-0.5 text-center text-[8px] font-semibold text-white sm:px-1 sm:text-[9px]"
                                >
                                  {getSlotCount(day, slot)}
                                </div>
                              ))}
                            </div>

                            <div className="hidden text-[10px] text-slate-300 sm:block">
                              M / A / E votes
                            </div>
                          </div>
                        </div>
                      </motion.button>
                    </div>
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