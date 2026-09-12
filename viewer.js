const groupIds = ["a", "b", "c", "d"];
const groupNames = { a: "Group A", b: "Group B", c: "Group C", d: "Group D" };
const defaultGroups = {
  a: "Revanth, Abhishek, Venkat P., Chaithanya, Ramu",
  b: "Venkat Y., Mourya, Wendy, Ratnakar, Sridhar",
  c: "Ravi, Srikanth, Krishna, Shankar, Jay",
  d: "Phani, Chaitanya T., Kishore, Sreenivasa, Ramesh",
};
const defaultState = {
  eventName: "ColdStream Pickleball Club Tournmant",
  view: "all",
  courts: 2,
  groups: defaultGroups,
  scores: {},
};

const firebaseConfig = window.PICKLEBALL_FIREBASE_CONFIG || {};
const tournamentId = window.PICKLEBALL_TOURNAMENT_ID || "main";
const stage = document.getElementById("stage");
const statusEl = document.getElementById("sync-status");
const updatedAtEl = document.getElementById("updated-at");
const eventTitle = document.getElementById("event-title");
let state = { ...defaultState };

document.getElementById("refresh-button")?.addEventListener("click", loadTournament);

if (!firebaseConfig.projectId) {
  setStatus("Firebase config missing.");
  render();
} else {
  loadTournament();
  window.setInterval(loadTournament, 30000);
}

async function loadTournament() {
  try {
    setStatus("Loading live scores...");
    const params = new URLSearchParams({
      key: firebaseConfig.apiKey,
      t: String(Date.now()),
    });
    const url = `https://firestore.googleapis.com/v1/projects/${firebaseConfig.projectId}/databases/(default)/documents/tournaments/${tournamentId}?${params}`;
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) throw new Error(`Firestore read failed: ${response.status}`);
    const documentData = await response.json();
    state = normalizeState(fromFirestoreFields(documentData.fields || {}));
    render();
    setStatus("Live scores loaded.");
  } catch (error) {
    setStatus(`Could not load live scores (${error.message}).`);
    render();
  }
}

function fromFirestoreFields(fields) {
  const output = {};
  Object.entries(fields).forEach(([key, value]) => {
    output[key] = fromFirestoreValue(value);
  });
  return output;
}

function fromFirestoreValue(value) {
  if ("stringValue" in value) return value.stringValue;
  if ("integerValue" in value) return Number(value.integerValue);
  if ("doubleValue" in value) return Number(value.doubleValue);
  if ("booleanValue" in value) return Boolean(value.booleanValue);
  if ("timestampValue" in value) return value.timestampValue;
  if ("mapValue" in value) return fromFirestoreFields(value.mapValue.fields || {});
  if ("arrayValue" in value) return (value.arrayValue.values || []).map(fromFirestoreValue);
  return "";
}

function normalizeState(data) {
  return {
    eventName: data.eventName || defaultState.eventName,
    view: data.view || defaultState.view,
    courts: Number(data.courts || defaultState.courts),
    groups: { ...defaultGroups, ...(data.groups || {}) },
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
  return [
    { p1: [0, 1], p2: [2, 3], bye: 4 },
    { p1: [0, 2], p2: [3, 4], bye: 1 },
    { p1: [0, 3], p2: [1, 4], bye: 2 },
    { p1: [0, 4], p2: [1, 2], bye: 3 },
    { p1: [1, 3], p2: [2, 4], bye: 0 },
  ].map((round) => {
    const p1 = round.p1.map((index) => list[index]);
    const p2 = round.p2.map((index) => list[index]);
    return {
      p1: p1.filter((player) => player !== "TBD"),
      p2: p2.filter((player) => player !== "TBD"),
      team1: team(p1),
      team2: team(p2),
      bye: list[round.bye],
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
  if (!match || score.t1 === "" || score.t2 === "" || !Number.isFinite(s1) || !Number.isFinite(s2) || s1 === s2) return fallback;
  return s1 > s2 ? match.team1 : match.team2;
}

function playoffMatches() {
  const baseMatches = basePlayoffMatches();

  return [
    ...baseMatches.slice(0, 2),
    { id: "champ-final", bracket: "Championship Bracket", round: "Finals", match: "Final: Winner SF1 vs Winner SF2", team1: playoffWinner("champ-sf1", "Winner SF1", baseMatches), team2: playoffWinner("champ-sf2", "Winner SF2", baseMatches) },
    ...baseMatches.slice(2),
    { id: "third-final", bracket: "3rd Place Playoff Bracket", round: "Final", match: "3rd Final: Winner Q1 vs Winner Q2", team1: playoffWinner("third-q1", "Winner Q1", baseMatches), team2: playoffWinner("third-q2", "Winner Q2", baseMatches) },
  ];
}

function render() {
  eventTitle.textContent = state.eventName || "Pickleball Tournament";
  let html = "";
  if (state.view === "all" || state.view === "ab") html += groupScreen("Schedule: Group A & Group B", ["a", "b"]);
  if (state.view === "all" || state.view === "cd") html += groupScreen("Schedule: Group C & Group D", ["c", "d"]);
  if (state.view === "all" || state.view === "playoff") html += overallStandingsScreen();
  if (state.view === "all" || state.view === "playoff") html += playoffScreen();
  stage.innerHTML = html;
  updatedAtEl.textContent = state.updatedAt ? `Updated ${new Date(state.updatedAt).toLocaleTimeString()}` : "";
}

function groupScreen(title, visibleGroups) {
  return `
    <section class="schedule-screen">
      <div class="screen-head"><h2>${escapeHtml(title)} <span aria-label="Trophy">🏆</span></h2></div>
      <div class="group-grid">${visibleGroups.map(groupCard).join("")}</div>
    </section>
  `;
}

function groupCard(groupId) {
  const players = parsePlayers(state.groups[groupId] || "");
  const rounds = getRounds(players);
  const rows = rounds.map((round, index) => {
    const score = state.scores[scoreKey(groupId, index)] || {};
    return `
      <tr>
        <td>Round ${index + 1}</td><td>${escapeHtml(round.team1)}</td><td class="vs">vs</td><td>${escapeHtml(round.team2)}</td>
        <td><span class="score-text">${score.t1 || "-"} : ${score.t2 || "-"}</span></td><td class="bye">${escapeHtml(round.bye)}</td>
      </tr>
    `;
  }).join("");
  return `
    <section class="tournament-card group-card group-${groupId}">
      <p class="group-name"><strong>${groupNames[groupId]}:</strong> ${escapeHtml(players.join(", ") || "Add five players")}</p>
      <div class="table-wrap">
        <table class="schedule-table group-schedule-table" aria-label="${groupNames[groupId]} schedule">
          <thead><tr><th>Round</th><th>Team 1</th><th class="vs">VS</th><th>Team 2</th><th>Score</th><th>Bye</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      ${standingsTable(players, rounds, groupId)}
    </section>
  `;
}

function standingsTable(players, rounds, groupId) {
  const rows = standings(players, rounds, groupId).map((row, index) => `
    <tr><td>${index + 1}. ${escapeHtml(row.player)}</td><td>${row.totalPoints}</td></tr>
  `).join("");
  return `
    <div class="standings">
      <p class="group-name"><strong>${groupNames[groupId]} Standings</strong></p>
      <div class="table-wrap"><table class="standings-table" aria-label="${groupNames[groupId]} standings"><thead><tr><th>Player</th><th>Total Points</th></tr></thead><tbody>${rows}</tbody></table></div>
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
    <tr><td>${index + 1}. ${escapeHtml(row.player)}</td><td>${row.totalPoints}</td></tr>
  `).join("");
  return `
    <section class="schedule-screen overall-screen">
      <div class="screen-head"><h2>Overall Player Standings <span aria-label="Trophy">🏆</span></h2></div>
      <section class="tournament-card overall-card">
        <div class="table-wrap"><table class="overall-table" aria-label="Overall player standings"><thead><tr><th>Player</th><th>Total Points</th></tr></thead><tbody>${rows}</tbody></table></div>
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
      <div class="screen-head"><h2>Playoff Schedule <span aria-label="Trophy">🏆</span></h2></div>
      <div class="playoff-grid">
        <section class="tournament-card third-place-card">
          <p class="group-name"><strong>3rd Place Playoff Bracket:</strong> 3rd and 4th ranked players cross-pair for 3rd place honors.</p>
          <div class="table-wrap"><table class="schedule-table playoff-schedule-table" aria-label="3rd place playoff bracket"><thead><tr><th>Round</th><th>Match</th><th>Team 1</th><th class="vs">VS</th><th>Team 2</th><th>Score</th></tr></thead><tbody>${thirdPlaceRows}</tbody></table></div>
        </section>
        <section class="tournament-card championship-card">
          <p class="group-name"><strong>Championship Bracket:</strong> Top 2 players from each group advance.</p>
          <div class="table-wrap"><table class="schedule-table playoff-schedule-table" aria-label="Championship bracket"><thead><tr><th>Round</th><th>Match</th><th>Team 1</th><th class="vs">VS</th><th>Team 2</th><th>Score</th></tr></thead><tbody>${championshipRows}</tbody></table></div>
        </section>
      </div>
    </section>
  `;
}

function playoffRow(match) {
  const score = state.scores[playoffScoreKey(match.id)] || {};
  return `
    <tr>
      <td>${escapeHtml(match.round)}</td><td class="highlight">${escapeHtml(match.match)}</td><td>${escapeHtml(match.team1)}</td><td class="vs">vs</td><td>${escapeHtml(match.team2)}</td>
      <td><span class="score-text">${score.t1 || "-"} : ${score.t2 || "-"}</span></td>
    </tr>
  `;
}

function setStatus(message) {
  statusEl.textContent = message;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
}
