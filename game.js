//npx http-server -c-1
//http://192.168.1.235:8080/?data=MTQsNixPSUxTLERJTlQsT1dFRCxTRUNU
import { fourLetterWords } from "./four-letter-words.js";
// BUTTONS
const restartButton = document.getElementById("restartButton");
const submitButton = document.getElementById("submitButton");
const hintButton = document.getElementById("hintButton");
const hintsRemainingEl = document.getElementById("hints-remaining");
const hintsCostEl = document.getElementById("hints-cost");
const clearButton = document.getElementById("clearButton");
//INSTRUCTIONS ELEMENTS
const infoButton = document.getElementById("infoButton");
const closeInfoButton = document.getElementById("i-close-button");
const instructionsEl = document.getElementById("instructions");
//MENU ELEMENTS
const menuButton = document.getElementById("menuButton");
const closeMenuButton = document.getElementById("menu-close-button");
const menuElement = document.getElementById("menu");
//PAUSE ELEMENTS
const pauseButton = document.getElementById("pauseButton");
const pausePopup = document.getElementById("pausePopup");
const resumeButton = document.getElementById("resumeButton");
//GAMEBOARD ELEMENTS
const mainTimer = document.getElementById("timer");
const form = document.querySelector("form");
const row1 = document.getElementById("row1");
const row2 = document.getElementById("row2");
const row3 = document.getElementById("row3");
const row4 = document.getElementById("row4");
const inputElements = [];
const availableLettersElement = document.getElementById("availableLettersDiv");
const wrongAnswer = document.getElementById("wrongAnswer");
const currentPoints = document.getElementById("currentPoints");
//RESULT ELEMENTS
const resultElement = document.getElementById("result");
const resultTime = document.getElementById("resultTime");
const resultCloseButton = document.getElementById("r-close-button");
const resultWords = document.getElementById("resultWords");
const resultHints = document.getElementById("resultHints");
const resultPoints = document.getElementById("resultPoints");
const challengeResultEl = document.getElementById("challengeResult");
//SHARE ELEMENTS
const shareUrlElement = document.getElementById("share_url");
const shareButton = document.getElementById("shareButton");
//CHALLENGE ELEMENTS
const challengeEl = document.getElementById("challenge");
const challengePointsEl = document.getElementById("challengePoints");
const challengeTimeEl = document.getElementById("challengeTime");
const challengeHintsEl = document.getElementById("challengeHints");
// TIMER
let startTime = undefined; // to store the start time
let pauseTime; // to store the time when the timer was paused
let pausedSeconds = 0; // to store the difference between the paused time and the start time
let elapsedSeconds = 0; // to store the elapsed time in seconds
let timerInterval; // to store the interval ID for the setInterval function
// GAME VARIABLES
const corners = [0, 3, 8, 11];
let challengeName = "";
let challengeTime = 0;
let challengeHints = 0;
let challengePoints = 0;
let pickedWords = ["test", "ever", "tape", "tear"];
let combinedWord = null;
let remainingLetters = null;
let isGameRunning = false;
let selectedLetter = null;
let firstGame = true;
let hintsUsed = 0;
let points = 900;
let randomGame = true;
let WORDLENGTH = 4;
let letterObjectsArray = [];
// ENUMS AND INTERFACES
var gametypeEnum;
(function (gametypeEnum) {
    gametypeEnum["random"] = "random";
    gametypeEnum["challenge"] = "challenge";
})(gametypeEnum || (gametypeEnum = {}));
let currentGametype = gametypeEnum.random;
let gameStats = {
    totalGamesPlayed: 0,
    totalHintsUsed: 0,
    totalTimer: 0,
    totalPoints: 0,
    hintsUsedAverage: 0,
    timerAverage: 0,
    pointsAverage: 0,
    quickestComplete: 0,
    highestPoints: 0,
    gamesShared: 0,
    challengeGamesPlayed: 0,
    challengeGamesWon: 0,
    challengeGamesLost: 0,
    challengeGamesWinrate: 0,
};
class LetterObject {
    constructor(props) {
        var _a;
        this.index = props.index;
        this.correctLetter = props.correctLetter;
        this.isCorner = corners.includes(this.index);
        this.inputElement = this.createInputElement();
        this.filledLetter = "";
        this.filledByIndex = null;
        this.filledAtIndex = null;
        this.isFilled = false;
        this.isFilledByHint = false;
        this.letter = props.letter;
        this.letterElement = this.createLetterElement();
        this.isSelected = false;
        this.isUsed = false;
        this.inputElement.addEventListener("click", () => {
            if (!this.isCorner && !this.isFilledByHint) {
                this.placeLetter();
            }
            ParseClasses();
        });
        (_a = this.letterElement) === null || _a === void 0 ? void 0 : _a.addEventListener("click", () => {
            if (!this.isUsed)
                this.selectLetter();
        });
    }
    createInputElement() {
        const input = document.createElement("div");
        input.classList.add("input");
        if (this.isCorner) {
            input.classList.add("corner");
            input.textContent = this.correctLetter;
            this.filledLetter;
        }
        if (this.index <= 3) {
            row1.appendChild(input);
        }
        else if (this.index === 4 || this.index === 5) {
            row2.appendChild(input);
        }
        else if (this.index === 6 || this.index === 7) {
            row3.appendChild(input);
        }
        else if (this.index >= 8 && this.index <= 11) {
            row4.appendChild(input);
        }
        return input;
    }
    createLetterElement() {
        let result = null;
        if (!this.isCorner) {
            const letter = document.createElement("div");
            letter.classList.add("letters");
            letter.textContent = this.letter;
            const letters = availableLettersElement.children;
            const randomIndex = Math.floor(Math.random() * (letters.length + 1));
            availableLettersElement.insertBefore(letter, letters[randomIndex]);
            result = letter;
        }
        return result;
    }
    selectLetter() {
        if (isGameRunning) {
            ToggleClass(form, "letterSelected", true); //add letterselected class to form
            if (this.isSelected) {
                //if the selected letter is already selected
                //deselect letter
                this.isSelected = false;
                ToggleClass(form, "letterSelected", false);
                selectedLetter = null;
            }
            else {
                //if the letter is not selected, deselect the current selected and select this one
                letterObjectsArray.forEach((letter) => {
                    if (letter.isSelected) {
                        letter.isSelected = false;
                    }
                });
                this.isSelected = true;
                selectedLetter = this;
            }
            ParseClasses();
        }
    }
    fillLetter(letterElement) {
        this.inputElement.textContent = letterElement;
    }
    placeLetter() {
        if (isGameRunning) {
            if (!this.isCorner && !this.isFilledByHint) {
                //if there is a letter, return it
                if (this.filledByIndex !== null) {
                    let filledBy = FindLetterFromIndex(this.filledByIndex);
                    let filledAt = FindLetterFromIndex(this.filledAtIndex);
                    if (filledBy) {
                        filledBy.filledAtIndex = null;
                        filledBy.isUsed = false;
                    }
                    this.isFilled = false;
                    this.filledByIndex = null;
                    this.inputElement.textContent = "";
                }
                //if a letter is selected, place it
                if (selectedLetter) {
                    this.filledByIndex = selectedLetter.index;
                    this.fillLetter(selectedLetter.letter);
                    this.isFilled = true;
                    selectedLetter.filledAtIndex = this.index;
                    selectedLetter.isSelected = false;
                    selectedLetter.isUsed = true;
                    selectedLetter = null;
                    form.classList.remove("letterSelected");
                }
            }
            ParseClasses();
        }
    }
}
function createInputs(combinedWord) {
    if (combinedWord !== null) {
        console.log(combinedWord);
        combinedWord.split("").forEach((letter, index) => {
            letterObjectsArray.push(new LetterObject({
                index: index,
                correctLetter: letter,
                letter: letter,
            }));
        });
    }
    console.log(letterObjectsArray);
}
function getAmountOfAvailableLetters(x) {
    return (x - 2) * 4;
}
function GetFourRandomWords() {
    let word1 = fourLetterWords[Math.floor(Math.random() * fourLetterWords.length)];
    let word2 = fourLetterWords[Math.floor(Math.random() * fourLetterWords.length)];
    let word3;
    let word4;
    let possibleWords3 = [];
    let possibleWords4 = [];
    fourLetterWords.forEach((word) => {
        if (word[0] === word1[0] && word[3] === word2[0]) {
            possibleWords3.push(word);
        }
        if (word[0] === word1[3] && word[3] === word2[3]) {
            possibleWords4.push(word);
        }
    });
    if (possibleWords3.length > 0 && possibleWords4.length > 0) {
        word3 = possibleWords3[Math.floor(Math.random() * possibleWords3.length)];
        word4 = possibleWords4[Math.floor(Math.random() * possibleWords4.length)];
        return [word1, word2, word3, word4];
    }
    else {
        return GetFourRandomWords();
    }
}
function CombineWords(words) {
    if (words) {
        let result = words[0] + words[2].charAt(1) + words[3].charAt(1) + words[2].charAt(2) + words[3].charAt(2) + words[1];
        return result;
    }
    return null;
}
function FormatTime(seconds) {
    const formatMinutes = Math.floor(seconds / 60)
        .toString()
        .padStart(2, "0");
    const formatSeconds = (seconds % 60).toString().padStart(2, "0");
    return `${formatMinutes}:${formatSeconds}`;
}
function Shuffle(array) {
    var m = array.length, t, i;
    // While there remain elements to shuffle…
    while (m) {
        // Pick a remaining element…
        i = Math.floor(Math.random() * m--);
        // And swap it with the current element.
        t = array[m];
        array[m] = array[i];
        array[i] = t;
    }
    return array;
}
function arraysAreEqual(arr1, arr2) {
    if (arr1.length !== arr2.length) {
        return false;
    }
    return arr1.every((element, index) => element === arr2[index]);
}
function ToggleClass(element, className, addClass) {
    if (element) {
        if (addClass) {
            element.classList.add(className);
        }
        else {
            element.classList.remove(className);
        }
    }
}
function ParseClasses() {
    letterObjectsArray.forEach((obj) => {
        ToggleClass(obj.inputElement, "filled", obj.isFilled);
        ToggleClass(obj.inputElement, "filledByHint", obj.isFilledByHint);
        ToggleClass(obj.letterElement, "used", obj.isUsed);
        ToggleClass(obj.letterElement, "selected", obj.isSelected);
        ToggleClass(obj.letterElement, "filledByHint", obj.isFilledByHint);
    });
}
const SelectByKeyPress = (event) => {
    const keyPressed = event.key.toUpperCase();
    for (let i = 0; i < letterObjectsArray.length; i++) {
        const letter = letterObjectsArray[i];
        if (letter.letter === keyPressed && !letter.isUsed && !letter.isFilledByHint) {
            letter.selectLetter();
            // Perform any additional actions you want to take
            break;
        }
    }
};
function FindLetterFromIndex(indexProp) {
    let result = null;
    letterObjectsArray.forEach((letterObject) => {
        if (indexProp && letterObject.index === indexProp) {
            result = letterObject;
        }
    });
    return result;
}
function StoreStats() {
    localStorage.setItem("gameStats", JSON.stringify(gameStats));
}
function GetStatsFromLocalStorage() { }
function FillStatsScreen() {
    document.getElementById("totalGamesPlayed").textContent = gameStats.totalGamesPlayed.toString();
    document.getElementById("hintsUsedAverage").textContent = gameStats.hintsUsedAverage.toString();
    document.getElementById("timerAverage").textContent = FormatTime(gameStats.timerAverage);
    document.getElementById("quickestComplete").textContent = FormatTime(gameStats.quickestComplete);
    document.getElementById("gamesShared").textContent = gameStats.gamesShared.toString();
    document.getElementById("challengeGamesPlayed").textContent = gameStats.challengeGamesPlayed.toString();
    document.getElementById("challengeGamesWon").textContent = gameStats.challengeGamesWon.toString();
    document.getElementById("challengeGamesLost").textContent = gameStats.challengeGamesLost.toString();
    document.getElementById("challengeGamesWinrate").textContent = gameStats.challengeGamesWinrate.toString();
}
function StartGame(gametype = gametypeEnum.random) {
    if (!isGameRunning) {
        console.log("starting game...");
        isGameRunning = true;
        cleanUpGame();
        switch (gametype) {
            case gametypeEnum.random:
                pickedWords = GetFourRandomWords();
                currentGametype = gametypeEnum.random;
                break;
            case gametypeEnum.challenge:
                challengePointsEl.textContent = challengePoints.toString();
                challengeHintsEl.textContent = challengeHints.toString();
                challengeTimeEl.textContent = FormatTime(challengeTime);
                ToggleClass(challengeEl, "hide", false);
                currentGametype = gametypeEnum.challenge;
                break;
        }
        console.log("picked words are: " + pickedWords);
        combinedWord = CombineWords(pickedWords);
        createInputs(combinedWord);
        //event handler for selected by key
        document.addEventListener("keydown", SelectByKeyPress);
        startTimer();
        firstGame = false;
    }
}
function giveHint() {
    if (isGameRunning) {
        remainingLetters = letterObjectsArray.filter((obj) => !obj.isFilledByHint && !obj.isCorner);
        if (remainingLetters.length > 2) {
            //get a random letter
            let index = Math.floor(Math.random() * remainingLetters.length);
            let randomLetter = remainingLetters[index];
            let randomLetterFilledAt = FindLetterFromIndex(randomLetter.filledAtIndex);
            let randomLetterFilledBy = FindLetterFromIndex(randomLetter.filledByIndex);
            //if letter already used
            if (randomLetter.isUsed && randomLetterFilledAt) {
                randomLetterFilledAt.isFilled = false;
                randomLetterFilledAt.fillLetter("");
                randomLetterFilledAt.filledByIndex = null;
                randomLetterFilledAt = null;
            }
            //if spot already filled
            if (randomLetterFilledBy) {
                randomLetterFilledBy.isUsed = false;
            }
            //place the letter
            randomLetter.fillLetter(randomLetter.letter);
            randomLetter.filledByIndex = randomLetter.index;
            randomLetter.isFilledByHint = true;
            randomLetter.isFilled = true;
            //remove points
            points -= hintsUsed * hintsUsed * 5;
            currentPoints.textContent = points.toString();
            hintsUsed++;
            hintsRemainingEl.innerHTML = `Hints Remaining: ${remainingLetters.length - 3}`;
            hintsCostEl.innerHTML = hintsUsed === 6 ? "Hint Cost: -" : `Hint Cost: ${hintsUsed * hintsUsed * 5} points`;
        }
        if (remainingLetters.length === 3) {
            hintButton.setAttribute("disabled", "");
        }
        ParseClasses();
    }
}
function clearAll() {
    if (isGameRunning) {
        letterObjectsArray.forEach((letter) => {
            if (!letter.isCorner && !letter.isFilledByHint) {
                letter.fillLetter("");
                letter.filledAtIndex = null;
                letter.filledByIndex = null;
                letter.isFilled = false;
                letter.isUsed = false;
            }
        });
        ParseClasses();
    }
}
function checkWin() {
    if (isGameRunning) {
        var count = 0;
        letterObjectsArray.forEach((letter) => {
            if (letter.inputElement.textContent === letter.letter) {
                count++;
            }
            else {
                wrongAnswer.innerHTML = "wrong answer, try again!";
                setTimeout(function () {
                    wrongAnswer.innerHTML = "";
                }, 3000);
            }
        });
        if (count === 12) {
            GameWon();
        }
    }
}
function GameWon() {
    isGameRunning = false;
    stopTimer();
    //calculate points
    //points = Math.max(0, 900 - elapsedSeconds - hintsUsed * hintsUsed * 5);
    //stats
    gameStats.totalGamesPlayed++;
    gameStats.totalHintsUsed += hintsUsed;
    gameStats.totalTimer += elapsedSeconds;
    gameStats.hintsUsedAverage = Math.round(gameStats.totalHintsUsed / gameStats.totalGamesPlayed);
    gameStats.timerAverage = Math.round(gameStats.totalTimer / gameStats.totalGamesPlayed);
    gameStats.totalPoints += points;
    gameStats.pointsAverage = Math.round(gameStats.totalPoints / gameStats.totalGamesPlayed);
    if (points > gameStats.highestPoints) {
        gameStats.highestPoints = points;
    }
    if (elapsedSeconds < gameStats.quickestComplete || gameStats.quickestComplete === 0) {
        gameStats.quickestComplete = elapsedSeconds;
    }
    if (currentGametype === gametypeEnum.challenge) {
        gameStats.challengeGamesPlayed++;
        if (points > challengePoints) {
            gameStats.challengeGamesWon++;
        }
        else {
            gameStats.challengeGamesLost++;
        }
        gameStats.challengeGamesWinrate = Math.round((gameStats.challengeGamesWon / gameStats.challengeGamesPlayed) * 100);
    }
    StoreStats();
    //result modal
    resultHints.textContent = hintsUsed.toString();
    resultTime.textContent = FormatTime(elapsedSeconds);
    resultPoints.textContent = points.toString();
    if (currentGametype === gametypeEnum.challenge) {
        gameStats.challengeGamesPlayed++;
        if (points > challengePoints) {
            challengeResultEl.textContent = "You have beaten the challenger!";
        }
        else {
            challengeResultEl.textContent = "You have been beaten by the challenger";
        }
    }
    pickedWords.forEach((word) => {
        let resultWord = document.createElement("div");
        resultWord.classList.add("result-word");
        let resultWordTitle = document.createElement("div");
        resultWordTitle.classList.add("result-word-title");
        resultWordTitle.textContent = word;
        resultWord.appendChild(resultWordTitle);
        resultWords.appendChild(resultWord);
        fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${word}`)
            .then((response) => response.json())
            .then((data) => {
            if (data && data.length > 0 && data[0].meanings.length > 0 && data[0].meanings[0].definitions.length > 0) {
                let definition = data[0].meanings[0].definitions[0].definition;
                let resultWordDefinition = document.createElement("div");
                resultWordDefinition.classList.add("result-word-definition");
                resultWordDefinition.textContent = definition;
                resultWord.appendChild(resultWordDefinition);
            }
        });
    });
    ToggleClass(resultElement, "show", true);
}
function RestartGame() {
    StartGame(gametypeEnum.random);
}
function PauseGame() {
    if (isGameRunning) {
        isGameRunning = false;
        stopTimer();
        ToggleClass(pausePopup, "hide", false);
        ToggleClass(mainTimer, "paused", true);
    }
}
function resumeGameButton() {
    if (!isGameRunning) {
        isGameRunning = true;
        startTimer();
        ToggleClass(pausePopup, "hide", true);
        ToggleClass(mainTimer, "paused", false);
    }
}
function cleanUpGame() {
    combinedWord = "";
    wrongAnswer.innerHTML = "";
    remainingLetters = null;
    hintsUsed = 0;
    hintButton.removeAttribute("disabled");
    availableLettersElement.innerHTML = "";
    row1.innerHTML = "";
    row2.innerHTML = "";
    row3.innerHTML = "";
    row4.innerHTML = "";
    document.removeEventListener("keydown", SelectByKeyPress);
    letterObjectsArray = [];
    ToggleClass(resultElement, "show", false);
    ToggleClass(challengeEl, "hide", true);
    elapsedSeconds = 0;
}
function shareGame() {
    gameStats.gamesShared += 1;
    StoreStats();
    const dataStr = points + "," + elapsedSeconds + "," + hintsUsed + "," + pickedWords.join(",");
    // encode the string to Base64
    const encodedData = btoa(dataStr);
    // construct the URL with the encoded data
    const urlName = window.location.origin + "/challenge.html?data=" + encodedData;
    const shareUrl = new URL(urlName);
    console.log(urlName);
    const searchprops = new URLSearchParams(shareUrl.search);
    const data = searchprops.get("data");
    console.log(atob(data));
    shareUrlElement.textContent = urlName;
    ToggleClass(shareUrlElement, "show", true);
    //if share api is available
    if (navigator.share) {
        navigator.share({
            title: "I challenge you to this game of Word Weaver!",
            url: shareUrl.toString(),
        });
    }
    else {
        console.log("Web Share API not supported");
        navigator.clipboard
            .writeText(shareUrl.toString())
            .then(() => {
            alert("URL copied to clipboard");
        })
            .catch(() => {
            alert("Failed to copy URL to clipboard");
        });
    }
}
//function with an optional parameter
function startTimer() {
    //only set startTime if it's not already set
    if (!startTime) {
        console.log("new timer");
        startTime = new Date();
        pausedSeconds = 0;
    }
    else {
        const now = new Date();
        pausedSeconds += now.getTime() - pauseTime.getTime();
        console.log(pausedSeconds);
    }
    timerInterval = setInterval(updateTimer, 1000); // update the timer every second
}
function stopTimer() {
    clearInterval(timerInterval); // stop the interval
    pauseTime = new Date(); // calculate the time that has passed since the timer was started
}
function updateTimer() {
    const now = new Date(); // get the current time
    //console.log(startTime.getTime(), now.getTime());
    elapsedSeconds = Math.floor((now.getTime() - startTime.getTime() - pausedSeconds) / 1000); // calculate the elapsed time in seconds
    mainTimer.textContent = FormatTime(elapsedSeconds);
    points--;
    currentPoints.textContent = points.toString();
    //setAndStoreGameState();
}
// ******************* //
function AddAllButtonEventListeners() {
    restartButton.addEventListener("click", RestartGame);
    submitButton.addEventListener("click", checkWin);
    hintButton.addEventListener("click", giveHint);
    clearButton.addEventListener("click", clearAll);
    shareButton.addEventListener("click", shareGame);
    pauseButton.addEventListener("click", PauseGame);
    resumeButton.addEventListener("click", resumeGameButton);
    menuButton.addEventListener("click", (event) => {
        if (menuElement.classList.contains("hide")) {
            ToggleClass(menuElement, "hide", false);
        }
        else {
            ToggleClass(menuElement, "hide", true);
        }
    });
    closeMenuButton.addEventListener("click", (event) => {
        ToggleClass(menuElement, "hide", true);
    });
    infoButton.addEventListener("click", (event) => {
        ToggleClass(instructionsEl, "hide", false);
    });
    closeInfoButton.addEventListener("click", (event) => {
        ToggleClass(instructionsEl, "hide", true);
    });
    resultCloseButton.addEventListener("click", (event) => {
        ToggleClass(resultElement, "show", false);
    });
}
function OnLoad() {
    let vh = window.innerHeight * 0.01;
    document.documentElement.style.setProperty("--vh", `${vh}px`);
    // We listen to the resize event
    window.addEventListener("resize", () => {
        // We execute the same script as before
        let vh = window.innerHeight * 0.01;
        document.documentElement.style.setProperty("--vh", `${vh}px`);
    });
    AddAllButtonEventListeners();
    //check if stats are stored in localstorage
    if (localStorage.getItem("gameStats")) {
        gameStats = JSON.parse(localStorage.getItem("gameStats"));
        FillStatsScreen();
    }
    if (window.location.pathname === "/challenge.html") {
        // Get the current URL
        const url = new URL(window.location.href);
        // Parse the query string
        const urlProps = new URLSearchParams(url.search);
        // Check if the 'data' propseter is present and has a value
        if (urlProps.has("data")) {
            const data = urlProps.get("data");
            // Split the comma-separated values into an array
            let dataSet = [];
            if (data) {
                dataSet = atob(data).split(",");
            }
            [challengePoints, challengeTime, challengeHints] = dataSet.map(Number);
            console.log(challengePoints);
            pickedWords = dataSet.splice(3);
            StartGame(gametypeEnum.challenge);
        }
        else {
            // Generate a random game
            console.log("incorrect challengeLink");
            StartGame(gametypeEnum.random);
        }
    }
    else {
        StartGame(gametypeEnum.random);
    }
}
OnLoad();
// const dailyWords = [];
// // call getfourwords function 1000 times
// for (let i = 0; i < 1000; i++) {
//   dailyWords.push(GetFourRandomWords());
// }
// // convert dailyWords array to a string
// const data = `const dailyWords = ${JSON.stringify(dailyWords)};`;
// // create a new Blob object with the data
// const blob = new Blob([data], {type: 'text/javascript'});
// // create a link element to download the file
// const link = document.createElement('a');
// link.href = URL.createObjectURL(blob);
// link.download = 'daily_words.js';
// // click the link to initiate download
// link.click();
