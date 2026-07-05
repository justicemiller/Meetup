import React, { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  AlertTriangle,
  Brush,
  CalendarDays,
  ChevronDown,
  ChevronUp,
  Clock,
  Copy,
  Download,
  Eraser,
  Link as LinkIcon,
  Lock,
  LogOut,
  MessageCircle,
  Moon,
  MousePointerClick,
  Pencil,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Sunrise,
  Sun,
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
  afternoon: "bg-amber-300",
  evening: "bg-violet-400",
};

const SLOT_LEGEND = {
  morning: {
    label: "Morning",
    Icon: Sunrise,
    chip: "bg-sky-300/20 text-sky-100 border-sky-200/20",
    dot: "bg-sky-300",
  },
  afternoon: {
    label: "Afternoon",
    Icon: Sun,
    chip: "bg-amber-300/20 text-amber-100 border-amber-200/20",
    dot: "bg-amber-300",
  },
  evening: {
    label: "Evening",
    Icon: Moon,
    chip: "bg-violet-400/20 text-violet-100 border-violet-200/20",
    dot: "bg-violet-400",
  },
};

const QUICK_FILL_PATTERNS = [
  { id: "morning", label: "Morning", slots: ["morning"], Icon: Sunrise, className: "bg-sky-300/20 text-sky-100 border-sky-200/20" },
  { id: "afternoon", label: "Afternoon", slots: ["afternoon"], Icon: Sun, className: "bg-amber-300/20 text-amber-100 border-amber-200/20" },
  { id: "evening", label: "Evening", slots: ["evening"], Icon: Moon, className: "bg-violet-400/20 text-violet-100 border-violet-200/20" },
  { id: "morning-afternoon", label: "M + A", slots: ["morning", "afternoon"], Icon: Sunrise, className: "bg-cyan-300/20 text-cyan-100 border-cyan-200/20" },
  { id: "afternoon-evening", label: "A + E", slots: ["afternoon", "evening"], Icon: Sun, className: "bg-orange-300/20 text-orange-100 border-orange-200/20" },
  { id: "morning-evening", label: "M + E", slots: ["morning", "evening"], Icon: Moon, className: "bg-indigo-300/20 text-indigo-100 border-indigo-200/20" },
  { id: "all-day", label: "Full day", slots: ["morning", "afternoon", "evening"], Icon: Sparkles, className: "bg-emerald-300/20 text-emerald-100 border-emerald-200/20" },
  { id: "clear", label: "Clear", slots: [], Icon: Eraser, className: "bg-slate-300/10 text-slate-200 border-slate-200/10" },
];

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

function SectionHeader({ icon: Icon, title, subtitle }) {
  return (
    <div className="mb-3 flex items-start gap-2">
      {Icon && <Icon className="mt-0.5 h-5 w-5 text-indigo-200" />}
      <div>
        <div className="font-semibold text-white">{title}</div>
        {subtitle && <div className="text-xs leading-5 text-slate-400">{subtitle}</div>}
      </div>
    </div>
  );
}

function ExpandButton({ open, onClick, children, className = "" }) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center justify-between rounded-2xl bg-white/10 px-4 py-3 text-left text-sm font-semibold text-white transition hover:bg-white/15 ${className}`}
    >
      <span>{children}</span>
      {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
    </button>
  );
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
  const [showTapOrder, setShowTapOrder] = useState(false);
  const [showOwnerPanel, setShowOwnerPanel] = useState(false);
  const [showInvitedEditor, setShowInvitedEditor] = useState(false);
  const [showDangerZone, setShowDangerZone] = useState(false);
  const [entryMode, setEntryMode] = useState("cycle");
  const [selectedPatternId, setSelectedPatternId] = useState("all-day");
  const [isPainting, setIsPainting] = useState(false);
  const paintedDaysRef = useRef(new Set());

  const monthOptions = useMemo(() => buildMonthOptions(), []);
  const selectedPattern = QUICK_FILL_PATTERNS.find((pattern) => pattern.id === selectedPatternId) || QUICK_FILL_PATTERNS[6];
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

  useEffect(() => {
    const finishPainting = () => {
      if (!isPainting) return;
      setIsPainting(false);
      paintedDaysRef.current.clear();
      loadVotes();
    };

    window.addEventListener("pointerup", finishPainting);
    window.addEventListener("pointercancel", finishPainting);

    return () => {
      window.removeEventListener("pointerup", finishPainting);
      window.removeEventListener("pointercancel", finishPainting);
    };
  }, [isPainting, meetupId]);

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
      const existingTitle =
        data.title ||
        `${new Date(existingYear, existingMonth, 1).toLocaleString("default", {
          month: "long",
        })} Meetup`;
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

  async function saveVote(day, personName, slots, shouldReload = true) {
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

    setStatusMessage(shouldReload ? "Saved. Reloading votes..." : "Saved.");
    if (shouldReload) await loadVotes();
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

    const uniqueInvited = Array.from(
      new Map(nextInvited.map((name) => [normalizeName(name), name])).values()
    );

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

  async function paintAvailability(day) {
    if (!currentPerson) {
      setStatusMessage("Enter your name before using quick fill.");
      return;
    }

    if (paintedDaysRef.current.has(day)) return;
    paintedDaysRef.current.add(day);

    const nextSlots = selectedPattern.slots;

    setAvailability((prev) => ({
      ...prev,
      [day]: {
        ...(prev[day] || {}),
        [currentPerson]: nextSlots,
      },
    }));

    await saveVote(day, currentPerson, nextSlots, false);
  }

  function handleDayPointerDown(event, day) {
    if (entryMode !== "paint") return;

    event.preventDefault();
    paintedDaysRef.current = new Set();
    setIsPainting(true);
    paintAvailability(day);
  }

  function handleDayPointerEnter(day) {
    if (entryMode !== "paint" || !isPainting) return;
    paintAvailability(day);
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
    await loadVotes();
    setStatusMessage("All votes and voter history were cleared.");
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
      `Month: ${monthYearLabel}`,
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

  const bestTimeBlocks = getBestTimeBlocks();
  const bestExactOption = bestTimeBlocks[0];
  const missingVoters = getMissingVoters();
  const maxScore = getMaxScore();
  const displayTitle = meetupTitle || defaultTitle;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-indigo-950 to-slate-900 p-3 text-white sm:p-8">
      <div className="mx-auto max-w-6xl space-y-5">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="space-y-3"
        >
          <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-3 py-1 text-xs text-indigo-100 shadow-sm backdrop-blur sm:text-sm">
            <CalendarDays className="h-4 w-4" />
            No-login meetup planner
          </div>

          <div>
            <h1 className="text-3xl font-semibold tracking-tight sm:text-5xl">
              {displayTitle}
            </h1>
            <p className="mt-2 text-xs text-indigo-200">
              {statusMessage} {isSaving ? "Saving..." : ""}
            </p>
          </div>
        </motion.div>

        <Card className="rounded-3xl border border-white/10 bg-white/10 text-white shadow-2xl backdrop-blur">
          <CardContent className="space-y-4 p-4 sm:p-5">
            <SectionHeader
              icon={CalendarDays}
              title="How to vote"
              subtitle="Enter your name, then tap a day to cycle through morning, afternoon, evening, combinations, or clear. Use Quick Fill if you want to paint the same availability across multiple days."
            />

            <div className="grid gap-2 sm:grid-cols-3">
              {SLOT_ORDER.map((slot) => {
                const { Icon, label, chip, dot } = SLOT_LEGEND[slot];
                return (
                  <div
                    key={slot}
                    className={`flex items-center gap-2 rounded-2xl border px-3 py-2 text-sm ${chip}`}
                  >
                    <span className={`h-2.5 w-2.5 rounded-full ${dot}`} />
                    <Icon className="h-4 w-4" />
                    <span className="font-semibold">{label}</span>
                  </div>
                );
              })}
            </div>

            <div>
              <ExpandButton open={showTapOrder} onClick={() => setShowTapOrder((prev) => !prev)}>
                Show tap order
              </ExpandButton>

              {showTapOrder && (
                <div className="mt-2 rounded-2xl bg-slate-950/40 p-4 text-sm leading-6 text-slate-300">
                  <div>1 tap = Morning</div>
                  <div>2 taps = Morning + Afternoon</div>
                  <div>3 taps = Morning + Afternoon + Evening</div>
                  <div>4 taps = Afternoon + Evening</div>
                  <div>5 taps = Morning + Evening</div>
                  <div>6 taps = Afternoon only</div>
                  <div>7 taps = Evening only</div>
                  <div>8 taps = Clear</div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-3xl border border-emerald-300/20 bg-emerald-950/25 text-white shadow-2xl backdrop-blur">
          <CardContent className="p-4 sm:p-5">
            <div className="flex items-center gap-2 text-sm font-medium text-emerald-100">
              <Trophy className="h-4 w-4" /> Best choice so far
            </div>

            {bestExactOption ? (
              <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
                <div>
                  <div className="text-2xl font-bold">
                    {monthName} {bestExactOption.day}, {SLOT_LABELS[bestExactOption.slot]}
                  </div>
                  <div className="mt-1 text-sm text-emerald-100">
                    {bestExactOption.count} of {friends.length || 1} available
                  </div>
                  <div className="mt-2 text-xs text-slate-300">
                    {bestExactOption.voters.join(", ")}
                  </div>
                </div>
                {isOwner && (
                  <Button
                    onClick={copyResults}
                    className="rounded-2xl bg-emerald-300 text-sm text-emerald-950 hover:bg-emerald-200"
                  >
                    <Download className="mr-2 inline h-4 w-4" /> Copy results
                  </Button>
                )}
              </div>
            ) : (
              <div className="mt-2 text-sm text-slate-300">No votes yet</div>
            )}
          </CardContent>
        </Card>

        <Card className="rounded-3xl border border-white/10 bg-white/10 text-white shadow-2xl backdrop-blur">
          <CardContent className="p-4 sm:p-5">
            <SectionHeader icon={Clock} title="Best exact options" subtitle="Ranked by how many people are available for each time block." />
            <div className="space-y-2 text-sm text-slate-300">
              {bestTimeBlocks.length ? (
                bestTimeBlocks.map((block, index) => (
                  <div
                    key={`${block.day}-${block.slot}`}
                    className={`rounded-2xl px-3 py-2 ${
                      index === 0 ? "bg-emerald-300/20 ring-1 ring-emerald-300/30" : "bg-white/10"
                    }`}
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
          </CardContent>
        </Card>

        <Card className="rounded-3xl border border-white/10 bg-white/10 text-white shadow-2xl backdrop-blur">
          <CardContent className="p-4 sm:p-5">
            <SectionHeader icon={Users} title="Voting status" subtitle="See who has voted and who is still missing from the invited list." />
            <div className="grid gap-4 sm:grid-cols-2">
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
                    <span className="text-sm text-slate-400">No invited list set</span>
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-3xl border border-white/10 bg-white/10 text-white shadow-2xl backdrop-blur">
          <CardContent className="space-y-5 p-4 sm:p-5">
            <div>
              <SectionHeader icon={UserRound} title="Your vote" subtitle="Enter your name first, then choose normal tap or quick fill." />
              <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto] sm:items-center">
                <input
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && startVoting()}
                  placeholder="Enter your name"
                  className="min-w-0 rounded-2xl border border-white/10 bg-slate-950/50 px-3 py-2 text-sm text-white outline-none ring-indigo-300 transition placeholder:text-slate-500 focus:ring-2"
                />

                <Button
                  onClick={startVoting}
                  className="rounded-2xl bg-indigo-300 text-slate-950 hover:bg-indigo-200"
                >
                  Start
                </Button>

                <Button
                  onClick={resetMyVotes}
                  className="rounded-2xl bg-white/10 text-white hover:bg-white/15"
                >
                  <RotateCcw className="mr-2 inline h-4 w-4" /> Reset my votes
                </Button>
              </div>

              {currentPerson && (
                <div className="mt-3 rounded-2xl bg-indigo-300 px-4 py-3 text-sm font-semibold text-slate-950">
                  Voting as {currentPerson}
                </div>
              )}
            </div>

            <div className="rounded-3xl border border-white/10 bg-slate-950/40 p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <SectionHeader
                  icon={entryMode === "paint" ? Brush : MousePointerClick}
                  title="Entry mode"
                  subtitle={
                    entryMode === "paint"
                      ? "Quick Fill is on. Choose a pattern, then tap or drag across days to apply it."
                      : "Normal mode is on. Tap each day to cycle through availability."
                  }
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <Button
                  onClick={() => setEntryMode("cycle")}
                  className={`rounded-2xl text-sm ${entryMode === "cycle" ? "bg-indigo-300 text-slate-950" : "bg-white/10 text-white hover:bg-white/15"}`}
                >
                  <MousePointerClick className="mr-2 inline h-4 w-4" /> Normal tap
                </Button>
                <Button
                  onClick={() => setEntryMode("paint")}
                  className={`rounded-2xl text-sm ${entryMode === "paint" ? "bg-emerald-300 text-emerald-950" : "bg-white/10 text-white hover:bg-white/15"}`}
                >
                  <Brush className="mr-2 inline h-4 w-4" /> Quick Fill
                </Button>
              </div>

              {entryMode === "paint" && (
                <div className="mt-4">
                  <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                    Paint this availability
                  </div>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {QUICK_FILL_PATTERNS.map((pattern) => {
                      const Icon = pattern.Icon;
                      const selected = selectedPatternId === pattern.id;
                      return (
                        <button
                          key={pattern.id}
                          onClick={() => setSelectedPatternId(pattern.id)}
                          className={`flex items-center justify-center gap-2 rounded-2xl border px-3 py-2 text-xs font-semibold transition ${pattern.className} ${selected ? "ring-2 ring-white/70" : "hover:bg-white/10"}`}
                        >
                          <Icon className="h-4 w-4" />
                          {pattern.label}
                        </button>
                      );
                    })}
                  </div>
                  <div className="mt-3 rounded-2xl bg-emerald-300/10 px-3 py-2 text-xs leading-5 text-emerald-100">
                    Tip: press and drag across multiple days to quickly fill them. Select Clear to erase multiple days.
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="overflow-hidden rounded-3xl border border-white/10 bg-white/10 text-white shadow-2xl backdrop-blur">
          <CardContent className="p-3 sm:p-5">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <div className="text-lg font-semibold">{monthYearLabel}</div>
                <div className="text-xs text-slate-400">
                  {entryMode === "paint"
                    ? `Quick Fill: ${selectedPattern.label}`
                    : "Morning / Afternoon / Evening"}
                </div>
              </div>
              {currentPerson && (
                <div className="hidden rounded-full bg-indigo-300 px-3 py-1 text-xs font-semibold text-slate-950 sm:block">
                  Voting as {currentPerson}
                </div>
              )}
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
                      onClick={() => entryMode === "cycle" && cycleAvailability(day)}
                      onPointerDown={(event) => handleDayPointerDown(event, day)}
                      onPointerEnter={() => handleDayPointerEnter(day)}
                      aria-label={`Day ${day}, ${fillLabel(
                        mySlots
                      )}, group score ${totalScore} out of ${maxScore}`}
                      style={{ touchAction: entryMode === "paint" ? "none" : "manipulation" }}
                      className={`relative min-h-[70px] w-full overflow-hidden rounded-2xl border p-1.5 text-left shadow-lg transition hover:-translate-y-0.5 hover:shadow-indigo-950/40 sm:aspect-square sm:min-h-0 sm:rounded-3xl sm:p-2 ${
                        isToday ? "border-emerald-300/80" : "border-white/10"
                      } ${
                        currentPerson
                          ? "bg-slate-950/50"
                          : "cursor-not-allowed bg-slate-950/30 opacity-70"
                      } ${entryMode === "paint" ? "cursor-crosshair" : ""}`}
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

        <div className="pb-6">
          {!showOwnerPanel ? (
            <button
              onClick={() => setShowOwnerPanel(true)}
              className="mx-auto flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold text-slate-400 transition hover:bg-white/10 hover:text-white"
            >
              <Lock className="h-3.5 w-3.5" /> Owner?
            </button>
          ) : (
            <Card className="rounded-3xl border border-white/10 bg-white/10 text-white shadow-2xl backdrop-blur">
              <CardContent className="space-y-4 p-4 sm:p-5">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 font-semibold text-white">
                    <ShieldCheck className="h-5 w-5 text-emerald-200" /> Owner tools
                  </div>
                  <Button
                    onClick={() => setShowOwnerPanel(false)}
                    className="rounded-2xl bg-white/10 text-xs text-white hover:bg-white/15"
                  >
                    Hide
                  </Button>
                </div>

                {!isOwner ? (
                  <div className="rounded-3xl border border-white/10 bg-slate-950/40 p-4">
                    <SectionHeader
                      icon={Lock}
                      title="Owner access"
                      subtitle="Friends can vote only. Enter the owner code to show owner tools on this device."
                    />
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
                ) : (
                  <div className="space-y-4">
                    <div className="rounded-3xl border border-emerald-300/20 bg-emerald-950/20 p-4">
                      <SectionHeader
                        icon={LinkIcon}
                        title="Share and export"
                        subtitle="Copy the friend link, text the invite, or export a summary."
                      />

                      <div className="mb-3 rounded-2xl bg-white/10 p-3 text-xs text-slate-200">
                        <div className="mb-1 font-semibold text-white">Friend link</div>
                        <div className="break-all">{shareUrl}</div>
                      </div>

                      <div className="grid gap-2 sm:grid-cols-4">
                        <Button
                          onClick={copyShareLink}
                          className="flex items-center justify-center rounded-2xl bg-indigo-300 text-sm text-slate-950 hover:bg-indigo-200"
                        >
                          <Copy className="mr-2 h-4 w-4" /> Copy
                        </Button>
                        <Button
                          onClick={textInvite}
                          className="flex items-center justify-center rounded-2xl bg-sky-300 text-sm text-sky-950 hover:bg-sky-200"
                        >
                          <MessageCircle className="mr-2 h-4 w-4" /> Text
                        </Button>
                        <Button
                          onClick={copyResults}
                          className="flex items-center justify-center rounded-2xl bg-violet-300 text-sm text-violet-950 hover:bg-violet-200"
                        >
                          <Download className="mr-2 h-4 w-4" /> Results
                        </Button>
                        <Button
                          onClick={copyOwnerLink}
                          className="flex items-center justify-center rounded-2xl bg-emerald-300 text-sm text-emerald-950 hover:bg-emerald-200"
                        >
                          <ShieldCheck className="mr-2 h-4 w-4" /> Owner
                        </Button>
                      </div>
                    </div>

                    <div className="rounded-3xl border border-white/10 bg-slate-950/40 p-4">
                      <SectionHeader icon={Pencil} title="Meetup setup" />

                      <div className="grid gap-3 sm:grid-cols-2">
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

                    <div className="rounded-3xl border border-white/10 bg-slate-950/40 p-4">
                      <ExpandButton open={showInvitedEditor} onClick={() => setShowInvitedEditor((prev) => !prev)}>
                        Edit invited list
                      </ExpandButton>

                      {showInvitedEditor && (
                        <div className="mt-3">
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
                    </div>

                    <div className="rounded-3xl border border-red-300/20 bg-red-950/20 p-4">
                      <ExpandButton
                        open={showDangerZone}
                        onClick={() => setShowDangerZone((prev) => !prev)}
                        className="bg-red-300/10 text-red-100 hover:bg-red-300/20"
                      >
                        Danger zone
                      </ExpandButton>

                      {showDangerZone && (
                        <div className="mt-3 grid gap-2">
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
                      )}
                    </div>

                    <Button
                      onClick={createNewMeetup}
                      className="w-full rounded-2xl bg-white/10 text-sm text-white hover:bg-white/15"
                    >
                      <Sparkles className="mr-2 inline h-4 w-4" /> New meetup
                    </Button>

                    <Button
                      onClick={leaveOwnerMode}
                      className="w-full rounded-2xl bg-white/10 text-sm text-white hover:bg-white/15"
                    >
                      <LogOut className="mr-2 inline h-4 w-4" /> Lock owner controls
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
