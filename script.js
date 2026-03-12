let bosses = [];
let activeTimers = [];

const HOUR_MS = 60 * 60 * 1000;
const AUTO_ROLLOVER_MS = 5 * 60 * 1000; // 5 menit setelah READY

const searchBoss = document.getElementById("searchBoss");
const bossSelect = document.getElementById("bossSelect");
const deathTime = document.getElementById("deathTime");
const addBossBtn = document.getElementById("addBossBtn");
const spawnGrid = document.getElementById("spawnGrid");
const otherGrid = document.getElementById("otherGrid");


const SUPABASE_URL = "https://jiwyoxfrrkokspbsyyzu.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_xVUesaxxq4aAnnKNP9JThA_KHDPvyaY";

const supabaseClient = supabase.createClient(
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY
);

async function loadBosses() {
  const response = await fetch("bosses.json");
  bosses = await response.json();
  populateBossOptions(bosses);

  activeTimers = loadTimersLocal();
  autoRollExpiredTimers();

  renderBossSections();
}

async function testInsertBoss() {
  const { data, error } = await supabaseClient
    .from("boss_timers")
    .insert([
      {
        boss_id: "boss_test_001",
        boss_name: "Boss Test",
        death_time: new Date().toISOString(),
        next_spawn_time: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        status: "active"
      }
    ]);

  console.log("INSERT DATA:", data);
  console.log("INSERT ERROR:", error);
}

function populateBossOptions(data) {
  bossSelect.innerHTML = `<option value="">-- Pilih Boss --</option>`;

  data.forEach((boss) => {
    const option = document.createElement("option");
    option.value = boss.name;
    option.textContent = `${boss.name} (${boss.region}) - ${boss.respawnHours}h`;
    bossSelect.appendChild(option);
  });
}

searchBoss.addEventListener("input", function () {
  const keyword = this.value.toLowerCase();

  const filtered = bosses.filter((boss) =>
    boss.name.toLowerCase().includes(keyword)
  );

  populateBossOptions(filtered);
});

addBossBtn.addEventListener("click", function () {
  const selectedBossName = bossSelect.value;
  const inputTime = deathTime.value.trim();

  if (!selectedBossName) {
    alert("Pilih boss dulu.");
    return;
  }

  if (!inputTime) {
    alert("Masukkan jam death. Contoh: 5:24 atau 17:24");
    return;
  }

  const boss = bosses.find((b) => b.name === selectedBossName);
  if (!boss) {
    alert("Boss tidak ditemukan.");
    return;
  }

  // menerima format H:MM atau HH:MM
  const timePattern = /^(\d{1,2}):([0-5]\d)$/;

  if (!timePattern.test(inputTime)) {
    alert("Format jam harus H:MM atau HH:MM. Contoh: 5:24, 05:24, atau 17:24");
    return;
  }

  let [hours, minutes] = inputTime.split(":").map(Number);

  if (hours < 0 || hours > 23) {
    alert("Jam harus antara 0 sampai 23.");
    return;
  }

  const deathDate = new Date();
  deathDate.setHours(hours, minutes, 0, 0);

  const nextSpawnDate = new Date(
    deathDate.getTime() + boss.respawnHours * 60 * 60 * 1000
  );

  const timerData = {
    id: Date.now(),
    name: boss.name,
    region: boss.region,
    respawnHours: boss.respawnHours,
    chance: boss.chance || null,
    killedAt: deathDate.getTime(),
    nextSpawn: nextSpawnDate.getTime()
  };

  const existingIndex = activeTimers.findIndex(
    (t) => t.name === boss.name && t.region === boss.region
  );

  if (existingIndex !== -1) {
    activeTimers[existingIndex] = timerData;
  } else {
    activeTimers.push(timerData);
  }

  saveTimersLocal();
  renderBossSections();
  deathTime.value = "";
});

function getCountdown(nextSpawn) {
  const now = Date.now();
  const diff = nextSpawn - now;

  if (diff <= 0) return "READY";

  const hours = Math.floor(diff / 3600000);
  const minutes = Math.floor((diff % 3600000) / 60000);
  const seconds = Math.floor((diff % 60000) / 1000);

  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function formatNextTime(timestamp) {
  const date = new Date(timestamp);
  return date.toLocaleTimeString("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  });
}

function buildCard(timer) {
  const isReady = timer.nextSpawn <= Date.now();

  return `
    <div class="boss-card ${isReady ? "ready" : ""}">
      <div class="card-top">
        <div>
          <div class="card-tags">
            <span class="tag">${timer.region}</span>
            ${timer.chance ? `<span class="tag">${timer.chance}</span>` : ""}
          </div>
          <div class="card-name">${timer.name}</div>
        </div>

        <div class="card-countdown">${getCountdown(timer.nextSpawn)}</div>
      </div>

      <div class="card-meta">
        <div>Respawn: ${timer.respawnHours}h</div>
      </div>

      <div class="card-footer">
        <span>Next: ${formatNextTime(timer.nextSpawn)}</span>
        <button class="delete-btn" onclick="deleteTimer(${timer.id})">Hapus</button>
      </div>
    </div>
  `;
}

function renderBossSections() {
  spawnGrid.innerHTML = "";
  otherGrid.innerHTML = "";

  activeTimers.sort((a, b) => a.nextSpawn - b.nextSpawn);

  const imminence = [];
  const others = [];

  activeTimers.forEach((timer) => {
    const diff = timer.nextSpawn - Date.now();

    if (diff <= 0 || diff <= 2 * 60 * 60 * 1000) {
      imminence.push(timer);
    } else {
      others.push(timer);
    }
  });

  if (imminence.length === 0) {
    spawnGrid.innerHTML = `<div class="card-meta">Belum ada boss yang dekat spawn.</div>`;
  } else {
    spawnGrid.innerHTML = imminence.map(buildCard).join("");
  }

  if (others.length === 0) {
    otherGrid.innerHTML = `<div class="card-meta">Belum ada boss lain.</div>`;
  } else {
    otherGrid.innerHTML = others.map(buildCard).join("");
  }
}

function deleteTimer(id) {
  activeTimers = activeTimers.filter((timer) => timer.id !== id);
  saveTimersLocal();
  renderBossSections();
}

function saveTimersLocal() {
  localStorage.setItem("bossTimers", JSON.stringify(activeTimers));
}

function loadTimersLocal() {
  const saved = localStorage.getItem("bossTimers");
  return saved ? JSON.parse(saved) : [];
}

function autoRollExpiredTimers() {
  const now = Date.now();
  let changed = false;

  activeTimers.forEach((timer) => {
    const intervalMs = timer.respawnHours * HOUR_MS;

    while (now - timer.nextSpawn >= AUTO_ROLLOVER_MS) {
      timer.nextSpawn += intervalMs;
      timer.killedAt = timer.nextSpawn - intervalMs;
      changed = true;
    }
  });

  if (changed) {
    activeTimers.sort((a, b) => a.nextSpawn - b.nextSpawn);
    saveTimersLocal();
  }
}

setInterval(() => {
  autoRollExpiredTimers();
  renderBossSections();
}, 1000);


loadBosses();
//testInsertBoss();