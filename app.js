import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.4/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
} from "https://www.gstatic.com/firebasejs/10.12.4/firebase-auth.js";
import {
  doc,
  getDoc,
  getFirestore,
  onSnapshot,
  serverTimestamp,
  setDoc,
} from "https://www.gstatic.com/firebasejs/10.12.4/firebase-firestore.js";

const groupIds = ["a", "b", "c", "d"];
const groupNames = {
  a: "Group A",
  b: "Group B",
  c: "Group C",
  d: "Group D",
};

const sampleGroups = {
  a: "Revanth, Abhishek, Venkat P., Chaithanya, Ramu",
  b: "Venkat Y., Mourya, Wendy, Ratnakar, Sridhar",
  c: "Ravi, Srikanth, Krishna, Shankar, Jay",
  d: "Phani, Chaitanya T., Kishore, Sreenivasa, Ramesh",
};

const defaultState = {
  eventName: "Saturday Pickleball Cup",
  view: "all",
  courts: 2,
  groups: sampleGroups,
  scores: {},
};

function cloneDefaultState() {
  return JSON.parse(JSON.stringify(defaultState));
}

const appRoot = document.getElementById("app");
const mode = appRoot.dataset.mode;
const stage = document.getElementById("stage");
const syncStatus = document.getElementById("sync-status");
const updatedAt = document.getElementById("updated-at");
const eventTitle = document.getElementById("event-title");
const firebaseConfig = window.PICKLEBALL_FIREBASE_CONFIG || {};
const tournamentId = window.PICKLEBALL_TOURNAMENT_ID || "main";
let state = cloneDefaultState();
let db;
let auth;
let tournamentRef;
let saveTimer;
let signedIn = false;

const configured = Boolean(firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.appId);

if (!configured) {
  setStatus("Firebase is not configured yet.");
  appRoot.classList.add("setup-warning");
  render();
} else {
  const firebaseApp = initializeApp(firebaseConfig);
  db = getFirestore(firebaseApp);
  auth = getAuth(firebaseApp);
  tournamentRef = doc(db, "tournaments", tournamentId);
  startApp();
}

function startApp() {
  if (mode === "admin") {
    wireAdmin();
  } else {
    wireViewer();
  }

  onSnapshot(tournamentRef, (snapshot) => {
    if (snapshot.exists()) {
      state = normalizeState(snapshot.data());
      render();
      setStatus(mode === "admin" ? "Latest scores loaded." : "Live scores loaded.");
    } else {
      state = cloneDefaultState();
      render();
      setStatus(mode === "admin" ? "No tournament saved yet." : "Waiting for admin scores.");
    }
  }, () => {
    setStatus("Could not connect to Firebase.");
  });
}

function wireViewer() {
  const refreshButton = document.getElementById("refresh-button");
  refreshButton?.addEventListener("click", refreshOnce);
  window.setInterval(refreshOnce, 30000);
}

function wireAdmin() {
  const loginPanel = document.getElementById("login-panel");
  const adminTools = document.getElementById("admin-tools");
  const signOutButton = document.getElementById("sign-out-button");

  document.getElementById("sign-in-button").addEventListener("click", async () => {
    const email = document.getElementById("admin-email").value.trim();
    const password = document.getElementById("admin-password").value;
    try {
      setStatus("Signing in...");
      await signInWithEmailAndPassword(auth, email, password);
    } catch (error) {
      setStatus("Sign in failed.");
    }
  });

  signOutButton.addEventListener("click", () => signOut(auth));

  onAuthStateChanged(auth, async (user) => {
    signedIn = Boolean(user);
    loginPanel.hidden = signedIn;
    adminTools.hidden = !signedIn;
    signOutButton.hidden = !signedIn;
    setStatus(signedIn ? "Signed in. Changes save automatically." : "Sign in to update scores.");
    if (signedIn) {
      await ensureTournamentExists();
      render();
    }
  });

  document.getElementById("event-name").addEventListener("input", (event) => {
    state.eventName = event.target.value;
    scheduleSave();
    render();
  });

  document.getElementById("view-mode").addEventListener("change", (event) => {
    state.view = event.target.value;
    scheduleSave();
    render();
  });

  document.getElementById("courts").addEventListener("input", (event) => {
    state.courts = Number(event.target.value) || 1;
    scheduleSave();
    render();
  });

  groupIds.forEach((id) => {
    document.getElementById(`group-${id}`).addEventListener("input", (event) => {
      state.groups[id] = event.target.value;
      scheduleSave();
      render();
    });
  });

  document.getElementById("sample-button").addEventListener("click", () => {
    state.groups = { ...sampleGroups };
    state.scores = {};
    scheduleSave();
    render();
  });

  document.getElementById("clear-scores-button").addEventListener("click", () => {
    state.scores = {};
    scheduleSave();
    render();
  });

  document.getElementById("print-button").addEventListener("click", () => window.print());
}

async function ensureTournamentExists() {
  const snapshot = await getDoc(tournamentRef);
  if (!snapshot.exists()) {
    await saveNow();
  }
}

async function refreshOnce() {
  if (!tournamentRef) return;
  try {
    const snapshot = await getDoc(tournamentRef);
    if (snapshot.exists()) {
      state = normalizeState(snapshot.data());
      render();
      setStatus("Scores refreshed.");
    }
  } catch (error) {
    setStatus("Refresh failed.");
  }
}

function normalizeState(data) {
  return {
    eventName: data.eventName || defaultState.eventName,
    view: data.view || defaultState.view,
    courts: Number(data.courts || defaultState.courts),
    groups: { ...defaultState.groups, ...(data.groups || {}) },
    scores: data.scores || {},
    updatedAt: data.updatedAt || null,
  };
}

function parsePlayers(value) {
  return value.split(/,|\n/).map((item) => item.trim()).filter(Boolean).slice(0, 5);
}

function team(players) {
  return players.filter(Boolean).join(" & ") || "TBD";
}

function getRounds(players) {
  const list = players.slice(0, 5);
  while (list.length < 5) list.push("TBD");

  return [4, 3, 2, 1, 0].map((byeIndex) => {
    const active = list.filter((_, index) => index !== byeIndex);
    return {
      p1: [active[0], active[1]].filter((player) => player !== "TBD"),
      p2: [active[2], active[3]].filter((player) => player !== "TBD"),
      team1: team([active[0], active[1]]),
      team2: team([active[2], active[3]]),
      bye: list[byeIndex],
    };
  });
}

function scoreKey(groupId, roundIndex) {
  return `${groupId}-${roundIndex}`;
}

function playoffScoreKey(matchId) {
  return `playoff-${matchId}`;
}

function standings(players, rounds, groupId) {
  const rows = new Map(players.map((player) => [player, { player, played: 0, totalPoints: 0 }]));

  rounds.forEach((round, index) => {
    const score = state.scores[scoreKey(groupId, index)] || {};
    const s1 = Number(score.t1);
    const s2 = Number(score.t2);
    if (!Number.isFinite(s1) || !Number.isFinite(s2) || score.t1 === "" || score.t2 === "") return;

    round.p1.forEach((player) => {
      const row = rows.get(player);
      if (!row) return;
      row.played += 1;
      row.totalPoints += s1;
    });

    round.p2.forEach((player) => {
      const row = rows.get(player);
      if (!row) return;
      row.played += 1;
      row.totalPoints += s2;
    });
  });

  return Array.from(rows.values()).sort((a, b) => b.totalPoints - a.totalPoints || a.player.localeCompare(b.player));
}

function groupRankings(groupId) {
  const players = parsePlayers(state.groups[groupId] || "");
  return standings(players, getRounds(players), groupId);
}

function rankedPlayer(groupId, rank) {
  return groupRankings(groupId)[rank - 1]?.player || `${groupId.toUpperCase()}${rank}`;
}

function teamFromRanks(left, right) {
  return `${rankedPlayer(left.group, left.rank)} & ${rankedPlayer(right.group, right.rank)}`;
}

function basePlayoffMatches() {
  return [
    {
      id: "champ-sf1",
      bracket: "Championship Bracket",
      round: "Semi-Finals",
      match: "SF1: A1 & C2 vs A2 & C1",
      team1: teamFromRanks({ group: "a", rank: 1 }, { group: "c", rank: 2 }),
      team2: teamFromRanks({ group: "a", rank: 2 }, { group: "c", rank: 1 }),
    },
    {
      id: "champ-sf2",
      bracket: "Championship Bracket",
      round: "Semi-Finals",
      match: "SF2: B1 & D2 vs D1 & B2",
      team1: teamFromRanks({ group: "b", rank: 1 }, { group: "d", rank: 2 }),
      team2: teamFromRanks({ group: "d", rank: 1 }, { group: "b", rank: 2 }),
    },
    {
      id: "third-q1",
      bracket: "3rd Place Playoff Bracket",
      round: "Qualifying",
      match: "Q1: A3 & C4 vs A4 & C3",
      team1: teamFromRanks({ group: "a", rank: 3 }, { group: "c", rank: 4 }),
      team2: teamFromRanks({ group: "a", rank: 4 }, { group: "c", rank: 3 }),
    },
    {
      id: "third-q2",
      bracket: "3rd Place Playoff Bracket",
      round: "Qualifying",
      match: "Q2: B3 & D4 vs B4 & D3",
      team1: teamFromRanks({ group: "b", rank: 3 }, { group: "d", rank: 4 }),
      team2: teamFromRanks({ group: "b", rank: 4 }, { group: "d", rank: 3 }),
    },
  ];
}

function playoffWinner(matchId, fallback, matches) {
  const match = matches.find((item) => item.id === matchId);
  const score = state.scores[playoffScoreKey(matchId)] || {};
  const s1 = Number(score.t1);
  const s2 = Number(score.t2);
  if (!match || score.t1 === "" || score.t2 === "" || !Number.isFinite(s1) || !Number.isFinite(s2) || s1 === s2) {
    return fallback;
  }
  return s1 > s2 ? match.team1 : match.team2;
}

function playoffMatches() {
  const baseMatches = basePlayoffMatches();

  return [
    ...baseMatches.slice(0, 2),
    {
      id: "champ-final",
      bracket: "Championship Bracket",
      round: "Finals",
      match: "Final: Winner SF1 vs Winner SF2",
      team1: playoffWinner("champ-sf1", "Winner SF1", baseMatches),
      team2: playoffWinner("champ-sf2", "Winner SF2", baseMatches),
    },
    ...baseMatches.slice(2),
    {
      id: "third-final",
      bracket: "3rd Place Playoff Bracket",
      round: "Final",
      match: "3rd Final: Winner Q1 vs Winner Q2",
      team1: playoffWinner("third-q1", "Winner Q1", baseMatches),
      team2: playoffWinner("third-q2", "Winner Q2", baseMatches),
    },
  ];
}

function render() {
  eventTitle.textContent = state.eventName || "Pickleball Tournament";
  if (mode === "admin") {
    syncAdminControls();
  }

  let html = "";
  if (state.view === "all" || state.view === "ab") html += groupScreen("Schedule: Group A & Group B", ["a", "b"]);
  if (state.view === "all" || state.view === "cd") html += groupScreen("Schedule: Group C & Group D", ["c", "d"]);
  if (state.view === "all" || state.view === "playoff") html += overallStandingsScreen();
  if (state.view === "all" || state.view === "playoff") html += playoffScreen();
  stage.innerHTML = html;

  if (mode === "admin" && signedIn) {
    stage.querySelectorAll("[data-score]").forEach((input) => {
      input.addEventListener("input", (event) => {
        const key = event.target.dataset.score;
        const side = event.target.dataset.side;
        state.scores[key] = state.scores[key] || {};
        state.scores[key][side] = event.target.value;
        scheduleSave();
      });
    });
  }

  updatedAt.textContent = state.updatedAt?.toDate
    ? `Updated ${state.updatedAt.toDate().toLocaleTimeString()}`
    : "";
}

function syncAdminControls() {
  document.getElementById("event-name").value = state.eventName;
  document.getElementById("view-mode").value = state.view;
  document.getElementById("courts").value = state.courts;
  groupIds.forEach((id) => {
    document.getElementById(`group-${id}`).value = state.groups[id] || "";
  });
}

function groupScreen(title, visibleGroups) {
  const courtCount = Math.max(1, Number(state.courts) || 1);
  return `
    <section class="schedule-screen">
      <div class="screen-head">
        <h2>${escapeHtml(title)} <span aria-label="Trophy">🏆</span></h2>
        <span>Court rotation: ${Array.from({ length: Math.min(courtCount, visibleGroups.length) }, (_, index) => `Court ${index + 1}`).join(", ")}</span>
      </div>
      <div class="group-grid">
        ${visibleGroups.map(groupCard).join("")}
      </div>
    </section>
  `;
}

function groupCard(groupId) {
  const players = parsePlayers(state.groups[groupId] || "");
  const rounds = getRounds(players);
  const scheduleRows = rounds.map((round, index) => {
    const key = scoreKey(groupId, index);
    const score = state.scores[key] || { t1: "", t2: "" };
    const scoreCell = mode === "admin" && signedIn
      ? `<div class="score-entry">
          <input data-score="${key}" data-side="t1" inputmode="numeric" type="number" min="0" max="99" value="${escapeHtml(score.t1 || "")}" aria-label="${groupNames[groupId]} round ${index + 1} team 1 score">
          <span>:</span>
          <input data-score="${key}" data-side="t2" inputmode="numeric" type="number" min="0" max="99" value="${escapeHtml(score.t2 || "")}" aria-label="${groupNames[groupId]} round ${index + 1} team 2 score">
        </div>`
      : `<span class="score-text">${score.t1 || "-"} : ${score.t2 || "-"}</span>`;

    return `
      <tr>
        <td>Round ${index + 1}</td>
        <td>${escapeHtml(round.team1)}</td>
        <td class="vs">vs</td>
        <td>${escapeHtml(round.team2)}</td>
        <td>${scoreCell}</td>
        <td class="bye">${escapeHtml(round.bye)}</td>
      </tr>
    `;
  }).join("");

  return `
    <section class="tournament-card">
      <p class="group-name"><strong>${groupNames[groupId]}:</strong> ${escapeHtml(players.join(", ") || "Add five players")}</p>
      <div class="table-wrap">
        <table class="schedule-table" aria-label="${groupNames[groupId]} schedule">
          <thead>
            <tr><th>Round</th><th>Team 1</th><th class="vs">VS</th><th>Team 2</th><th>Score</th><th>Bye</th></tr>
          </thead>
          <tbody>${scheduleRows}</tbody>
        </table>
      </div>
      ${standingsTable(players, rounds, groupId)}
    </section>
  `;
}

function standingsTable(players, rounds, groupId) {
  const rows = standings(players, rounds, groupId).map((row, index) => `
    <tr>
      <td>${index + 1}. ${escapeHtml(row.player)}</td>
      <td>${row.totalPoints}</td>
    </tr>
  `).join("");

  return `
    <div class="standings">
      <p class="group-name"><strong>${groupNames[groupId]} Standings</strong></p>
      <div class="table-wrap">
        <table aria-label="${groupNames[groupId]} standings">
          <thead><tr><th>Player</th><th>Total Points</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>
  `;
}

function overallStandings() {
  return groupIds.flatMap((groupId) => {
    const players = parsePlayers(state.groups[groupId] || "");
    return standings(players, getRounds(players), groupId);
  }).sort((a, b) => b.totalPoints - a.totalPoints || a.player.localeCompare(b.player));
}

function overallStandingsScreen() {
  const rows = overallStandings().map((row, index) => `
    <tr>
      <td>${index + 1}. ${escapeHtml(row.player)}</td>
      <td>${row.totalPoints}</td>
    </tr>
  `).join("");

  return `
    <section class="schedule-screen">
      <div class="screen-head">
        <h2>Overall Player Standings <span aria-label="Trophy">🏆</span></h2>
      </div>
      <section class="tournament-card">
        <div class="table-wrap">
          <table aria-label="Overall player standings">
            <thead><tr><th>Player</th><th>Total Points</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </section>
    </section>
  `;
}

function playoffScreen() {
  const matches = playoffMatches();
  const championshipRows = matches.filter((match) => match.bracket === "Championship Bracket").map(playoffRow).join("");
  const thirdPlaceRows = matches.filter((match) => match.bracket === "3rd Place Playoff Bracket").map(playoffRow).join("");

  return `
    <section class="schedule-screen">
      <div class="screen-head">
        <h2>Playoff Schedule <span aria-label="Trophy">🏆</span></h2>
      </div>
      <div class="playoff-grid">
        <section class="tournament-card">
          <p class="group-name"><strong>3rd Place Playoff Bracket:</strong> 3rd and 4th ranked players cross-pair for 3rd place honors.</p>
          <div class="table-wrap">
            <table class="schedule-table playoff-schedule-table" aria-label="3rd place playoff bracket">
              <thead>
                <tr><th>Round</th><th>Match</th><th>Team 1</th><th class="vs">VS</th><th>Team 2</th><th>Score</th></tr>
              </thead>
              <tbody>${thirdPlaceRows}</tbody>
            </table>
          </div>
        </section>
        <section class="tournament-card">
          <p class="group-name"><strong>Championship Bracket:</strong> Top 2 players from each group advance.</p>
          <div class="table-wrap">
            <table class="schedule-table playoff-schedule-table" aria-label="Championship bracket">
              <thead>
                <tr><th>Round</th><th>Match</th><th>Team 1</th><th class="vs">VS</th><th>Team 2</th><th>Score</th></tr>
              </thead>
              <tbody>${championshipRows}</tbody>
            </table>
          </div>
        </section>
      </div>
    </section>
  `;
}

function playoffRow(match) {
  return `
    <tr>
      <td>${escapeHtml(match.round)}</td>
      <td class="highlight">${escapeHtml(match.match)}</td>
      <td>${escapeHtml(match.team1)}</td>
      <td class="vs">vs</td>
      <td>${escapeHtml(match.team2)}</td>
      <td>${playoffScoreCell(match.id)}</td>
    </tr>
  `;
}

function playoffScoreCell(matchId) {
  const key = playoffScoreKey(matchId);
  const score = state.scores[key] || { t1: "", t2: "" };
  if (mode === "admin" && signedIn) {
    return `<div class="score-entry">
      <input data-score="${key}" data-side="t1" inputmode="numeric" type="number" min="0" max="99" value="${escapeHtml(score.t1 || "")}" aria-label="${matchId} team 1 score">
      <span>:</span>
      <input data-score="${key}" data-side="t2" inputmode="numeric" type="number" min="0" max="99" value="${escapeHtml(score.t2 || "")}" aria-label="${matchId} team 2 score">
    </div>`;
  }
  return `<span class="score-text">${score.t1 || "-"} : ${score.t2 || "-"}</span>`;
}

function scheduleSave() {
  if (!signedIn) return;
  setStatus("Saving...");
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveNow().catch(handleSaveError);
  }, 450);
}

async function saveNow() {
  await setDoc(tournamentRef, {
    eventName: state.eventName,
    view: state.view,
    courts: state.courts,
    groups: state.groups,
    scores: state.scores,
    updatedAt: serverTimestamp(),
  }, { merge: true });
  setStatus("Saved.");
}

function handleSaveError(error) {
  const denied = error?.code === "permission-denied";
  setStatus(denied ? "Save failed: this account is not allowed to update scores." : "Save failed. Try again.");
}

function setStatus(message) {
  syncStatus.textContent = message;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[char]);
}
