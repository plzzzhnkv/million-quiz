const TOTAL_LEVELS = 15;
const STORAGE_KEY = "fifteenQuestionsStats";
const SOUND_STORAGE_KEY = "fifteenQuestionsSoundEnabled";
const PROGRESS_TRANSITION_MS = 1900;
const REDUCED_PROGRESS_TRANSITION_MS = 120;
const DEFAULT_LANGUAGE = "ru";

const translations = {
  ru: {
    play: "Играть",
    loading: "Загрузка...",
    questionProgress: "Вопрос {current} из {total}",
    progressWithPoints: "Вопрос {current} из {total} • {points} очков",
    points: "{points} очков",
    bestLevel: "{level} из {total}",
    next: "Далее",
    secondChance: "🎬 Второй шанс",
    adMark: "(РЕКЛАМА)",
    soundOffLabel: "Выключить звук",
    soundOnLabel: "Включить звук",
    hintFifty: "Два неподходящих варианта скрыты.",
    audienceTitle: "Мнение зала:",
    expertPhraseOne: "Эксперт рассуждает спокойно и выбирает вариант",
    expertPhraseTwo: "Эксперт не уверен на все сто, но советует вариант",
    expertPhraseThree: "Эксперт считает самым сильным вариантом",
    correctAnswer: "Правильный ответ: {answer}.",
    questionFileNotFound: "Файл questions.json не найден",
    validationMinQuestions: "В questions.json должно быть минимум 120 вопросов",
    validationLevelQuestions: "На уровне {level} должно быть минимум 8 вопросов",
    validationDuplicateQuestion: "Повтор вопроса: {question}",
    validationAnswersCount: "У вопроса {number} должно быть 4 варианта ответа",
    validationCorrectIndex: "У вопроса {number} неверный correctIndex",
    validationCorrectAnswerMissing: "У вопроса {number} правильный ответ отсутствует среди вариантов",
    validationExplanationMissing: "У вопроса {number} нет explanation"
  }
};

const soundFiles = {
  click: "assets/sounds/click.mp3",
  correct: "assets/sounds/correct.mp3",
  wrong: "assets/sounds/wrong.mp3",
  win: "assets/sounds/win.mp3"
};

const prizeScale = [
  100,
  200,
  300,
  500,
  800,
  1200,
  1800,
  2600,
  3800,
  5500,
  8000,
  12000,
  18000,
  26000,
  40000
];

const screens = {
  start: document.querySelector("#start-screen"),
  question: document.querySelector("#question-screen"),
  lose: document.querySelector("#lose-screen"),
  win: document.querySelector("#win-screen"),
  error: document.querySelector("#error-screen")
};

const startButton = document.querySelector("#start-button");
const menuButtons = document.querySelectorAll(".menu-button");
const questionText = document.querySelector("#question-text");
const answersContainer = document.querySelector("#answers");
const levelLabel = document.querySelector("#level-label");
const pointsLabel = document.querySelector("#points-label");
const levelList = document.querySelector("#level-list");
const progressPanel = document.querySelector(".progress-panel");
const progressMessage = document.querySelector("#progress-message");
const progressNextButton = document.querySelector("#progress-next-button");
const secondChanceButton = document.querySelector("#second-chance-button");
const loseText = document.querySelector("#lose-text");
const hintButtons = document.querySelectorAll(".hint-button");
const hintMessage = document.querySelector("#hint-message");
const bestLevelText = document.querySelector("#best-level");
const winsCountText = document.querySelector("#wins-count");
const gamesCountText = document.querySelector("#games-count");
const soundToggle = document.querySelector("#sound-toggle");
const gameRoot = document.querySelector(".app");

let questions = [];
let questionBank = [];
let currentLevel = 0;
let isAnswerLocked = false;
let stats = loadStats();
let isSoundEnabled = loadSoundSetting();
let sounds = createSounds();
let yandexSdk = null;
let yandexPlayer = null;
let currentLanguage = DEFAULT_LANGUAGE;
let isSdkReady = false;
let areQuestionsReady = false;
let isLoadingReadySent = false;
let isGamePaused = false;
let isMenuNavigationLocked = false;
let isGameResultRecorded = false;
let isRecordedGameUpgradedToWin = false;
let isSecondChanceUsed = false;
let secondChanceFailedLevel = null;
let usedHints = {
  fifty: false,
  audience: false,
  expert: false
};

function getSupportedLanguage(rawLanguage) {
  if (typeof rawLanguage !== "string") {
    return DEFAULT_LANGUAGE;
  }

  const normalizedLanguage = rawLanguage.trim().toLowerCase().split("-")[0];

  return translations[normalizedLanguage] ? normalizedLanguage : DEFAULT_LANGUAGE;
}

function t(key, params = {}) {
  const dictionary = translations[currentLanguage] || translations[DEFAULT_LANGUAGE];
  const template = dictionary[key] || translations[DEFAULT_LANGUAGE][key] || key;

  return Object.entries(params).reduce((text, [param, value]) => {
    return text.replaceAll(`{${param}}`, String(value));
  }, template);
}

function applyLanguage(rawLanguage) {
  currentLanguage = getSupportedLanguage(rawLanguage);
  document.documentElement.lang = currentLanguage;
  updateLocalizedTexts();
}

function updateLocalizedTexts() {
  startButton.textContent = areQuestionsReady ? t("play") : t("loading");
  progressNextButton.textContent = t("next");
  renderSecondChanceButtonText();
  updateStatsView();
  updateSoundToggle();

  if (levelList.children.length > 0) {
    buildLevelScale();
    updateLevelScale();
  }

  if (screens.question.classList.contains("active") && questions[currentLevel]) {
    updateQuestionLabels();
  }

  if (progressPanel.classList.contains("is-visible")) {
    updateProgressMessage(currentLevel);
  }
}

// Создаем шкалу один раз, а потом только меняем активные состояния.
function buildLevelScale() {
  levelList.innerHTML = "";

  for (let index = TOTAL_LEVELS - 1; index >= 0; index -= 1) {
    const item = document.createElement("li");
    item.className = "level-item";
    item.dataset.level = String(index);

    item.innerHTML = `
      <span class="level-number">${index + 1}</span>
      <span>${t("points", { points: formatNumber(prizeScale[index]) })}</span>
    `;

    levelList.append(item);
  }
}

function showScreen(screenName) {
  hideProgressTransition();

  Object.values(screens).forEach((screen) => {
    screen.classList.remove("active");
  });

  screens[screenName].classList.add("active");
  updateSecondChanceButton();
}

function updateLevelScale() {
  const items = levelList.querySelectorAll(".level-item");

  items.forEach((item) => {
    const level = Number(item.dataset.level);
    item.classList.toggle("current", level === currentLevel);
    item.classList.toggle("passed", level < currentLevel);
  });
}

function hideProgressTransition() {
  progressPanel.classList.remove("is-visible");
  progressPanel.setAttribute("aria-hidden", "true");
  progressNextButton.hidden = true;
  progressNextButton.disabled = false;
}

function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function wait(milliseconds) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, milliseconds);
  });
}

function formatNumber(number) {
  return number.toLocaleString(currentLanguage === "ru" ? "ru-RU" : currentLanguage);
}

function updateQuestionLabels() {
  levelLabel.textContent = t("questionProgress", {
    current: currentLevel + 1,
    total: TOTAL_LEVELS
  });
  pointsLabel.textContent = t("points", {
    points: formatNumber(prizeScale[currentLevel])
  });
}

function updateProgressMessage(nextLevelIndex) {
  progressMessage.textContent = t("progressWithPoints", {
    current: nextLevelIndex + 1,
    total: TOTAL_LEVELS,
    points: formatNumber(prizeScale[nextLevelIndex])
  });
}

async function showProgressTransition(nextLevelIndex, options = {}) {
  const visibleTime = prefersReducedMotion() ? REDUCED_PROGRESS_TRANSITION_MS : PROGRESS_TRANSITION_MS;
  const hideTime = prefersReducedMotion() ? 20 : 160;
  const shouldWaitForContinue = options.waitForContinue === true;

  updateProgressMessage(nextLevelIndex);
  updateLevelScale();
  progressNextButton.textContent = t("next");
  progressNextButton.hidden = !shouldWaitForContinue;
  progressNextButton.disabled = false;
  progressPanel.setAttribute("aria-hidden", "false");
  progressPanel.classList.add("is-visible");

  if (shouldWaitForContinue) {
    await waitForProgressContinue(hideTime);
    return;
  }

  await wait(visibleTime);

  hideProgressTransition();
  await wait(hideTime);
}

function waitForProgressContinue(hideTime) {
  return new Promise((resolve) => {
    progressNextButton.addEventListener("click", async () => {
      const adPromise = showFullscreenAd();

      progressNextButton.disabled = true;
      await adPromise;
      hideProgressTransition();
      await wait(hideTime);
      resolve();
    }, { once: true });
  });
}

function shouldShowLevelAd(nextLevelIndex) {
  return [3, 6, 9, 12].includes(nextLevelIndex);
}

function preventDefaultAction(event) {
  event.preventDefault();
}

function setupGameInputGuards() {
  [gameRoot, soundToggle].forEach((element) => {
    element.addEventListener("contextmenu", preventDefaultAction);
    element.addEventListener("selectstart", preventDefaultAction);
    element.addEventListener("dragstart", preventDefaultAction);
  });
}

async function initYandexGames() {
  if (!window.YaGames || typeof window.YaGames.init !== "function") {
    console.info("Yandex Games SDK is not available. Fallback mode is active.");
    applyLanguage(DEFAULT_LANGUAGE);
    isSdkReady = true;
    tryNotifyGameReady();
    return;
  }

  try {
    yandexSdk = await window.YaGames.init();
    applyLanguage(yandexSdk?.environment?.i18n?.lang);
    subscribeToYandexGameEvents(yandexSdk);
    await initPlayerData(yandexSdk);
    console.info("Yandex Games SDK initialized.");
  } catch (error) {
    applyLanguage(DEFAULT_LANGUAGE);
    console.warn("Yandex Games SDK initialization failed. Fallback mode is active.", error);
  } finally {
    isSdkReady = true;
    tryNotifyGameReady();
  }
}

function subscribeToYandexGameEvents(ysdk) {
  if (typeof ysdk?.on !== "function") {
    return;
  }

  ysdk.on("game_api_pause", pauseGameAudio);
  ysdk.on("game_api_resume", resumeGameAudio);
}

function tryNotifyGameReady() {
  if (isLoadingReadySent || !isSdkReady || !areQuestionsReady) {
    return;
  }

  isLoadingReadySent = true;

  try {
    yandexSdk?.features?.LoadingAPI?.ready?.();
  } catch (error) {
    console.warn("Yandex Games LoadingAPI.ready() failed.", error);
  }
}

async function initPlayerData(ysdk) {
  if (typeof ysdk?.getPlayer !== "function") {
    return;
  }

  try {
    yandexPlayer = await ysdk.getPlayer({ scopes: false });

    if (typeof yandexPlayer?.getData !== "function") {
      yandexPlayer = null;
      return;
    }

    const cloudData = await yandexPlayer.getData();
    const cloudStats = normalizeStats(cloudData);
    stats = mergeStats(stats, cloudStats);

    saveLocalStats(stats);
    updateStatsView();

    if (hasCloudStatsBehind(cloudStats, stats)) {
      savePlayerStats(stats);
    }
  } catch (error) {
    yandexPlayer = null;
    console.warn("Yandex Player Data is not available. localStorage fallback is active.", error);
  }
}

function loadStats() {
  const emptyStats = {
    bestLevel: 0,
    wins: 0,
    games: 0
  };

  try {
    const savedStats = localStorage.getItem(STORAGE_KEY);

    if (!savedStats) {
      return emptyStats;
    }

    return normalizeStats(JSON.parse(savedStats));
  } catch (error) {
    return emptyStats;
  }
}

function normalizeStats(rawStats) {
  const source = rawStats && typeof rawStats === "object" ? rawStats : {};

  return {
    bestLevel: cleanStatNumber(source.bestLevel, 0, TOTAL_LEVELS),
    wins: cleanStatNumber(source.wins, 0, Number.MAX_SAFE_INTEGER),
    games: cleanStatNumber(source.games, 0, Number.MAX_SAFE_INTEGER)
  };
}

function mergeStats(firstStats, secondStats) {
  const first = normalizeStats(firstStats);
  const second = normalizeStats(secondStats);
  const mergedStats = {
    bestLevel: Math.max(first.bestLevel, second.bestLevel),
    wins: Math.max(first.wins, second.wins),
    games: Math.max(first.games, second.games)
  };

  mergedStats.games = Math.max(mergedStats.games, mergedStats.wins);

  return mergedStats;
}

function hasCloudStatsBehind(cloudStats, mergedStats) {
  return (
    cloudStats.bestLevel < mergedStats.bestLevel ||
    cloudStats.wins < mergedStats.wins ||
    cloudStats.games < mergedStats.games
  );
}

function saveLocalStats(statsToSave) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(normalizeStats(statsToSave)));
  } catch (error) {
    // Если браузер запретил localStorage, игра продолжает работать без сохранения.
  }
}

function savePlayerStats(statsToSave) {
  if (typeof yandexPlayer?.setData !== "function") {
    return;
  }

  try {
    const savePromise = yandexPlayer.setData(normalizeStats(statsToSave), true);

    if (savePromise && typeof savePromise.catch === "function") {
      savePromise.catch((error) => {
        console.warn("Yandex Player Data saving failed.", error);
      });
    }
  } catch (error) {
    console.warn("Yandex Player Data saving failed.", error);
  }
}

function saveStats() {
  saveLocalStats(stats);
  savePlayerStats(stats);
}

function loadSoundSetting() {
  try {
    const savedValue = localStorage.getItem(SOUND_STORAGE_KEY);
    return savedValue === null ? true : savedValue === "true";
  } catch (error) {
    return true;
  }
}

function saveSoundSetting() {
  try {
    localStorage.setItem(SOUND_STORAGE_KEY, String(isSoundEnabled));
  } catch (error) {
    // Если localStorage недоступен, звук все равно можно включать и выключать на текущей странице.
  }
}

function createSounds() {
  if (typeof Audio === "undefined") {
    return {};
  }

  return Object.entries(soundFiles).reduce((audioMap, [name, path]) => {
    const audio = new Audio(path);
    audio.preload = "none";
    audioMap[name] = audio;
    return audioMap;
  }, {});
}

function playSound(name) {
  if (isGamePaused || !isSoundEnabled || !sounds[name]) {
    return;
  }

  try {
    sounds[name].currentTime = 0;
    const playPromise = sounds[name].play();

    if (playPromise) {
      playPromise.catch(() => {
        // Файл звука может отсутствовать. В этом случае игра просто продолжает работать.
      });
    }
  } catch (error) {
    // Любая ошибка аудио не должна мешать игре.
  }
}

function stopAllSounds() {
  Object.values(sounds).forEach((audio) => {
    try {
      audio.pause();
      audio.currentTime = 0;
    } catch (error) {
      // Ошибка отдельного аудиофайла не должна мешать паузе игры.
    }
  });
}

function pauseGameAudio() {
  isGamePaused = true;
  stopAllSounds();
}

function resumeGameAudio() {
  isGamePaused = false;
}

function showFullscreenAd() {
  if (typeof yandexSdk?.adv?.showFullscreenAdv !== "function") {
    return Promise.resolve(false);
  }

  return new Promise((resolve) => {
    let isFinished = false;

    const finishAd = (wasShown) => {
      if (isFinished) {
        return;
      }

      isFinished = true;
      resumeGameAudio();
      resolve(Boolean(wasShown));
    };

    try {
      pauseGameAudio();
      yandexSdk.adv.showFullscreenAdv({
        callbacks: {
          onOpen() {},
          onClose(wasShown) {
            finishAd(wasShown);
          },
          onError() {
            finishAd(false);
          }
        }
      });
    } catch (error) {
      finishAd(false);
    }
  });
}

function showRewardedAd() {
  if (typeof yandexSdk?.adv?.showRewardedVideo !== "function") {
    return Promise.resolve(false);
  }

  return new Promise((resolve) => {
    let isFinished = false;
    let isRewarded = false;

    const finishAd = () => {
      if (isFinished) {
        return;
      }

      isFinished = true;
      resumeGameAudio();
      resolve(isRewarded);
    };

    try {
      pauseGameAudio();
      yandexSdk.adv.showRewardedVideo({
        callbacks: {
          onOpen() {},
          onRewarded() {
            isRewarded = true;
          },
          onClose() {
            finishAd();
          },
          onError() {
            isRewarded = false;
            finishAd();
          }
        }
      });
    } catch (error) {
      isRewarded = false;
      finishAd();
    }
  });
}

function toggleSound() {
  isSoundEnabled = !isSoundEnabled;
  saveSoundSetting();
  updateSoundToggle();

  if (isSoundEnabled) {
    playSound("click");
  } else {
    stopAllSounds();
  }
}

function updateSoundToggle() {
  soundToggle.classList.toggle("is-muted", !isSoundEnabled);
  soundToggle.setAttribute("aria-pressed", String(isSoundEnabled));
  soundToggle.setAttribute("aria-label", isSoundEnabled ? t("soundOffLabel") : t("soundOnLabel"));
}

function cleanStatNumber(value, min, max) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return min;
  }

  return Math.min(Math.max(Math.floor(number), min), max);
}

function updateStatsView() {
  bestLevelText.textContent = t("bestLevel", {
    level: stats.bestLevel,
    total: TOTAL_LEVELS
  });
  winsCountText.textContent = String(stats.wins);
  gamesCountText.textContent = String(stats.games);
}

function finishGame(achievedLevel, isWin) {
  if (isGameResultRecorded) {
    let shouldSaveStats = false;

    if (achievedLevel > stats.bestLevel) {
      stats.bestLevel = achievedLevel;
      shouldSaveStats = true;
    }

    if (isWin && !isRecordedGameUpgradedToWin) {
      isRecordedGameUpgradedToWin = true;
      stats.wins += 1;
      shouldSaveStats = true;
    }

    if (shouldSaveStats) {
      saveStats();
      updateStatsView();
    }

    return;
  }

  isGameResultRecorded = true;
  isRecordedGameUpgradedToWin = false;
  stats.games += 1;
  stats.bestLevel = Math.max(stats.bestLevel, achievedLevel);

  if (isWin) {
    stats.wins += 1;
  }

  saveStats();
  updateStatsView();
}

function resetHints() {
  usedHints = {
    fifty: false,
    audience: false,
    expert: false
  };
  updateHintButtons();
}

function updateHintButtons() {
  hintButtons.forEach((button) => {
    const hintName = button.dataset.hint;
    button.disabled = usedHints[hintName] || isAnswerLocked;
  });
}

function startGame() {
  if (questionBank.length === 0) {
    return;
  }

  playSound("click");
  questions = selectQuestionsForGame();
  currentLevel = 0;
  isAnswerLocked = false;
  isGameResultRecorded = false;
  isRecordedGameUpgradedToWin = false;
  isSecondChanceUsed = false;
  secondChanceFailedLevel = null;
  resetHints();
  showQuestion();
  showScreen("question");
}

function selectQuestionsForGame() {
  const selectedQuestions = [];

  for (let level = 1; level <= TOTAL_LEVELS; level += 1) {
    const levelQuestions = questionBank.filter((question) => question.level === level);
    const randomIndex = Math.floor(Math.random() * levelQuestions.length);
    selectedQuestions.push(shuffleQuestionAnswers(levelQuestions[randomIndex]));
  }

  return selectedQuestions;
}

function shuffleQuestionAnswers(question) {
  const answerItems = question.answers.map((answer, index) => {
    return {
      text: answer,
      isCorrect: index === question.correctIndex
    };
  });
  const shuffledItems = shuffleArray(answerItems);

  // correctIndex должен указывать на новый номер правильного ответа после перемешивания.
  return {
    ...question,
    answers: shuffledItems.map((item) => item.text),
    correctIndex: shuffledItems.findIndex((item) => item.isCorrect)
  };
}

function showMainMenu() {
  playSound("click");
  isAnswerLocked = false;
  secondChanceFailedLevel = null;
  updateSecondChanceButton();
  updateStatsView();
  showScreen("start");
}

async function handleMainMenuClick() {
  if (isMenuNavigationLocked) {
    return;
  }

  isMenuNavigationLocked = true;

  try {
    await showFullscreenAd();
    showMainMenu();
  } finally {
    isMenuNavigationLocked = false;
  }
}

function canUseSecondChance() {
  return (
    secondChanceFailedLevel !== null &&
    !isSecondChanceUsed &&
    // На последнем вопросе второй шанс не показываем, чтобы не выходить за пределы массива questions.
    secondChanceFailedLevel < TOTAL_LEVELS - 1 &&
    typeof yandexSdk?.adv?.showRewardedVideo === "function"
  );
}

function renderSecondChanceButtonText() {
  secondChanceButton.innerHTML = "";

  const mainText = document.createElement("span");
  mainText.className = "second-chance-main";
  mainText.textContent = t("secondChance");

  const adMark = document.createElement("span");
  adMark.className = "second-chance-ad-mark";
  adMark.textContent = t("adMark");

  secondChanceButton.append(mainText, adMark);
}

function updateSecondChanceButton() {
  renderSecondChanceButtonText();
  secondChanceButton.hidden = !screens.lose.classList.contains("active") || !canUseSecondChance();
  secondChanceButton.disabled = false;
}

async function handleSecondChanceClick() {
  if (!canUseSecondChance()) {
    updateSecondChanceButton();
    return;
  }

  const adPromise = showRewardedAd();
  secondChanceButton.disabled = true;
  const rewarded = await adPromise;

  if (!rewarded || secondChanceFailedLevel === null) {
    updateSecondChanceButton();
    return;
  }

  isSecondChanceUsed = true;
  currentLevel = secondChanceFailedLevel + 1;
  secondChanceFailedLevel = null;
  isAnswerLocked = false;

  if (currentLevel >= TOTAL_LEVELS) {
    finishGame(TOTAL_LEVELS, true);
    updateLevelScale();
    showScreen("win");
    playSound("win");
    return;
  }

  showQuestion();
  showScreen("question");
}

function showQuestion() {
  const currentQuestion = questions[currentLevel];

  updateQuestionLabels();
  questionText.textContent = currentQuestion.question;
  answersContainer.innerHTML = "";
  hintMessage.innerHTML = "";

  // Кнопки создаются из JSON, чтобы вопросы можно было менять без правки HTML.
  currentQuestion.answers.forEach((answer, index) => {
    const button = document.createElement("button");
    button.className = "answer-button";
    button.type = "button";
    button.textContent = answer;
    button.addEventListener("click", () => chooseAnswer(index, button));

    answersContainer.append(button);
  });

  updateLevelScale();
  updateHintButtons();
}

function chooseAnswer(answerIndex, selectedButton) {
  if (isAnswerLocked) {
    return;
  }

  isAnswerLocked = true;
  updateHintButtons();

  const currentQuestion = questions[currentLevel];
  const isCorrect = answerIndex === currentQuestion.correctIndex;
  const answerButtons = answersContainer.querySelectorAll(".answer-button");

  playSound(isCorrect ? "correct" : "wrong");

  answerButtons.forEach((button) => {
    button.disabled = true;
  });

  selectedButton.classList.add(isCorrect ? "correct" : "wrong");
  answerButtons[currentQuestion.correctIndex].classList.add("correct");

  // Небольшая пауза помогает игроку увидеть результат ответа.
  window.setTimeout(async () => {
    if (!isCorrect) {
      loseText.textContent = t("correctAnswer", {
        answer: currentQuestion.answers[currentQuestion.correctIndex]
      });
      finishGame(currentLevel + 1, false);

      if (
        !isSecondChanceUsed &&
        currentLevel < TOTAL_LEVELS - 1 &&
        typeof yandexSdk?.adv?.showRewardedVideo === "function"
      ) {
        secondChanceFailedLevel = currentLevel;
      } else {
        secondChanceFailedLevel = null;
      }

      showScreen("lose");
      isAnswerLocked = false;
      return;
    }

    currentLevel += 1;

    if (currentLevel === TOTAL_LEVELS) {
      finishGame(TOTAL_LEVELS, true);
      updateLevelScale();
      showScreen("win");
      playSound("win");
      isAnswerLocked = false;
      return;
    }

    await showProgressTransition(currentLevel, {
      waitForContinue: shouldShowLevelAd(currentLevel)
    });

    showQuestion();
    isAnswerLocked = false;
    updateHintButtons();
  }, 800);
}

function useFiftyHint() {
  const currentQuestion = questions[currentLevel];
  const wrongIndexes = currentQuestion.answers
    .map((answer, index) => index)
    .filter((index) => index !== currentQuestion.correctIndex);
  const indexesToHide = shuffleArray(wrongIndexes).slice(0, 2);
  const answerButtons = answersContainer.querySelectorAll(".answer-button");

  indexesToHide.forEach((index) => {
    answerButtons[index].classList.add("hidden-by-hint");
    answerButtons[index].disabled = true;
  });

  hintMessage.textContent = t("hintFifty");
}

function useAudienceHint() {
  const currentQuestion = questions[currentLevel];
  const percents = createAudiencePercents(currentQuestion.correctIndex);
  const lines = currentQuestion.answers.map((answer, index) => {
    return `${answer}: ${percents[index]}%`;
  });

  hintMessage.innerHTML = `<strong>${t("audienceTitle")}</strong><br>${lines.join("<br>")}`;
}

function useExpertHint() {
  const currentQuestion = questions[currentLevel];
  const recommendationIndex = chooseExpertAnswer(currentQuestion.correctIndex);
  const recommendation = currentQuestion.answers[recommendationIndex];
  const phrases = [
    t("expertPhraseOne"),
    t("expertPhraseTwo"),
    t("expertPhraseThree")
  ];
  const phrase = phrases[Math.floor(Math.random() * phrases.length)];

  hintMessage.textContent = `${phrase}: ${recommendation}.`;
}

function useHint(hintName) {
  if (usedHints[hintName] || isAnswerLocked) {
    return;
  }

  playSound("click");
  usedHints[hintName] = true;
  updateHintButtons();

  if (hintName === "fifty") {
    useFiftyHint();
  }

  if (hintName === "audience") {
    useAudienceHint();
  }

  if (hintName === "expert") {
    useExpertHint();
  }
}

function shuffleArray(items) {
  return [...items].sort(() => Math.random() - 0.5);
}

// Зал помогает, но проценты сделаны не слишком очевидными.
function createAudiencePercents(correctIndex) {
  const correctPercent = getRandomInteger(42, 58);
  const remainingPercent = 100 - correctPercent;
  const wrongIndexes = [0, 1, 2, 3].filter((index) => index !== correctIndex);
  const firstWrong = getRandomInteger(12, Math.min(28, remainingPercent - 12));
  const secondWrong = getRandomInteger(8, remainingPercent - firstWrong - 4);
  const thirdWrong = remainingPercent - firstWrong - secondWrong;
  const percents = [0, 0, 0, 0];

  percents[correctIndex] = correctPercent;
  shuffleArray([firstWrong, secondWrong, thirdWrong]).forEach((percent, index) => {
    percents[wrongIndexes[index]] = percent;
  });

  return percents;
}

// Эксперт чаще подсказывает верно, но иногда может сомневаться.
function chooseExpertAnswer(correctIndex) {
  if (Math.random() < 0.85) {
    return correctIndex;
  }

  const wrongIndexes = [0, 1, 2, 3].filter((index) => index !== correctIndex);
  return wrongIndexes[Math.floor(Math.random() * wrongIndexes.length)];
}

function getRandomInteger(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

async function loadQuestions() {
  try {
    startButton.disabled = true;
    startButton.textContent = t("loading");

    const response = await fetch("questions.json");

    if (!response.ok) {
      throw new Error(t("questionFileNotFound"));
    }

    questionBank = await response.json();
    validateQuestionBank(questionBank);

    startButton.disabled = false;
    startButton.textContent = t("play");
    areQuestionsReady = true;
    tryNotifyGameReady();
  } catch (error) {
    console.warn("Questions loading failed.", error);
    startButton.disabled = true;
    showScreen("error");
  }
}

function validateQuestionBank(bank) {
  if (!Array.isArray(bank) || bank.length < 120) {
    throw new Error(t("validationMinQuestions"));
  }

  const questionTexts = new Set();

  for (let level = 1; level <= TOTAL_LEVELS; level += 1) {
    const levelQuestions = bank.filter((question) => question.level === level);

    if (levelQuestions.length < 8) {
      throw new Error(t("validationLevelQuestions", { level }));
    }
  }

  bank.forEach((question, index) => {
    if (questionTexts.has(question.question)) {
      throw new Error(t("validationDuplicateQuestion", { question: question.question }));
    }

    questionTexts.add(question.question);

    if (!Array.isArray(question.answers) || question.answers.length !== 4) {
      throw new Error(t("validationAnswersCount", { number: index + 1 }));
    }

    if (!Number.isInteger(question.correctIndex) || question.correctIndex < 0 || question.correctIndex > 3) {
      throw new Error(t("validationCorrectIndex", { number: index + 1 }));
    }

    if (!question.answers[question.correctIndex]) {
      throw new Error(t("validationCorrectAnswerMissing", { number: index + 1 }));
    }

    if (typeof question.explanation !== "string" || question.explanation.trim() === "") {
      throw new Error(t("validationExplanationMissing", { number: index + 1 }));
    }
  });
}

startButton.addEventListener("click", startGame);
soundToggle.addEventListener("click", toggleSound);
secondChanceButton.addEventListener("click", handleSecondChanceClick);

menuButtons.forEach((button) => {
  button.addEventListener("click", handleMainMenuClick);
});

hintButtons.forEach((button) => {
  button.addEventListener("click", () => useHint(button.dataset.hint));
});

document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    pauseGameAudio();
  } else {
    resumeGameAudio();
  }
});

window.addEventListener("blur", pauseGameAudio);
window.addEventListener("focus", resumeGameAudio);

buildLevelScale();
updateLevelScale();
updateHintButtons();
updateStatsView();
updateSoundToggle();
setupGameInputGuards();
initYandexGames();
loadQuestions();
