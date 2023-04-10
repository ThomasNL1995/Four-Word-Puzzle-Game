//npx http-server -c-1
//http://192.168.1.235:8080/?data=MTQsNixPSUxTLERJTlQsT1dFRCxTRUNU
import { fourLetterWords } from "./four-letter-words.js";
import { dailyWords } from "./dailyWords.js";
const restartButton = document.getElementById("restartButton");
const submitButton = document.getElementById("submitButton");
const hintButton = document.getElementById("hintButton");
const clearButton = document.getElementById("clearButton");
const infoButton = document.getElementById("infoButton");
const closeInfoButton = document.getElementById("i-close-button");
const instructionsEl = document.getElementById("instructions");
const menuButton = document.getElementById("menuButton");
const closeMenuButton = document.getElementById("menu-close-button");
const menuElement = document.getElementById("menu");
const mainTimer = document.getElementById("timer");
const form = document.querySelector("form");
const inputElements = form.querySelectorAll('input[type="text"]');
const availableLettersElement = document.getElementById("availableLettersDiv");
const wrongAnswer = document.getElementById("wrongAnswer");
const resultElement = document.getElementById("result");
const resultTime = document.getElementById("resultTime");
const resultCloseButton = document.getElementById("r-close-button");
const resultWords = document.getElementById("resultWords");
const resultHints = document.getElementById("resultHints");
const shareUrlElement = document.getElementById("share_url");
const shareButton = document.getElementById("shareButton");
const challengeEl = document.getElementById("challenge");
const challengeNameEl = document.getElementById("challengeName");
const challengeTimeEl = document.getElementById("challengeTime");
const challengeHintsEl = document.getElementById("challengeHints");
const corners = [0, 3, 8, 11];
let challengeName = "";
let challengeTime = 0;
let challengeHints = 0;
let pickedWords = ["test", "ever", "tape", "tear"];
let combinedWord = null;
let remainingLetters = null;
let isGameRunning = false;
let selectedLetter = null;
let letterObjectsArray = [];
let firstGame = true;
let hintsUsed = 0;
let randomGame = true;
class LetterObject {
    constructor(props) {
        this.props = props;
        this.filledBy = props.filledBy;
        this.filledAt = props.filledAt;
        this.index = props.index;
        this.letter = props.letter;
        this.inputElement = props.inputElement;
        this.letterElement = props.letterElement;
        this.isCorner = props.isCorner;
        this.isFilled = props.isFilled;
        this.isFilledByHint = props.isFilledByHint;
        this.isAvailable = props.isAvailable;
        this.isUsed = props.isUsed;
        this.isSelected = props.isSelected;
    }
}
let gameState = {
    gameStarted: false,
    letterObjectsArray: [],
    hintsUsed: 0,
    timer: 0,
};
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
function GetDailyWords() {
    const startDate = new Date("4-6-2023");
    const oneDay = 24 * 60 * 60 * 1000; // number of milliseconds in one day
    const today = new Date();
    const diffDays = Math.round((today.getTime() - startDate.getTime()) / oneDay);
    const index = diffDays;
    return dailyWords[index];
}
function CombineWords(words) {
    if (words) {
        let result = words[0] + words[2].charAt(1) + words[3].charAt(1) + words[2].charAt(2) + words[3].charAt(2) + words[1];
        return result;
    }
    return null;
}
function setGameState() {
    gameState.letterObjectsArray = letterObjectsArray;
    gameState.hintsUsed = hintsUsed;
    gameState.timer = elapsedTime;
    localStorage.setItem("gameState", JSON.stringify(gameState));
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
function SelectLetter(letter) {
    //if the clicked letter is not used yet
    if (!letter.isUsed) {
        //add letterselected class to form
        form.classList.add("letterSelected");
        //if the selected letter is already selected
        if (letter.isSelected) {
            //deselect letter
            letter.isSelected = false;
            form.classList.remove("letterSelected");
            selectedLetter = null;
        }
        else {
            //if the letter is not selected, deselect the current selected and select this one
            letterObjectsArray.forEach((letterObject) => {
                if (!letterObject.isCorner && letterObject.isSelected) {
                    letterObject.isSelected = false;
                }
            });
            letter.isSelected = true;
            selectedLetter = letter;
        }
    }
    ParseClasses();
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
            SelectLetter(letter);
            // Perform any additional actions you want to take
            break;
        }
    }
};
function MakeLettersPlaceable(letter) {
    // make letter placeable
    if (firstGame && letter.inputElement) {
        letter.inputElement.addEventListener("click", (event) => {
            if (!letter.isCorner && !letter.isFilledByHint) {
                //if there is a letter, return it
                if (letter.filledBy) {
                    letter.isFilled = false;
                    letter.filledBy.isUsed = false;
                    letter.filledBy = null;
                    letter.inputElement.value = "";
                    console.log(letterObjectsArray);
                }
                //if a letter is selected, place it
                if (selectedLetter) {
                    letter.filledBy = selectedLetter;
                    letter.inputElement.value = selectedLetter.letter;
                    letter.isFilled = true;
                    selectedLetter.filledAt = letter;
                    selectedLetter.isSelected = false;
                    selectedLetter.isUsed = true;
                    selectedLetter = null;
                    form.classList.remove("letterSelected");
                }
            }
            ParseClasses();
        });
    }
}
function CreateLetterObjectsArray() {
    //create letter objects and put them in the array
    inputElements.forEach((input, index) => {
        letterObjectsArray.push(new LetterObject({
            filledBy: null,
            filledAt: null,
            index: index,
            letter: combinedWord[index],
            inputElement: input,
            letterElement: null,
            isCorner: corners.includes(index),
            isFilled: false,
            isFilledByHint: false,
            isAvailable: false,
            isUsed: false,
            isSelected: false,
        }));
    });
}
function ResetLetterObjectsArray() {
    //sort the array and reset everything
    letterObjectsArray.sort((a, b) => a.index - b.index);
    letterObjectsArray.forEach((letter, index) => {
        letter.filledBy = null;
        letter.filledAt = null;
        letter.letter = combinedWord[index];
        letter.index = index;
        letter.isCorner = corners.includes(index);
        letter.inputElement = inputElements[index];
        letter.letterElement = null;
        letter.isFilled = false;
        letter.isFilledByHint = false;
        letter.isAvailable = false;
        letter.isUsed = false;
        letter.isSelected = false;
    });
}
function placeLettersInGame() {
    //add the corners and available letters to their spot
    for (const letterObject of letterObjectsArray) {
        if (letterObject.isCorner && letterObject.inputElement) {
            letterObject.inputElement.value = letterObject.letter;
        }
        else {
            const letterDiv = document.createElement("div");
            letterDiv.textContent = letterObject.letter;
            letterDiv.classList.add("letters");
            availableLettersElement.appendChild(letterDiv);
            letterObject.letterElement = letterDiv;
        }
    }
}
function startGame(gametype = "random") {
    if (!isGameRunning) {
        console.log("starting game...");
        isGameRunning = true;
        cleanUpGame();
        switch (gametype) {
            case "random":
                pickedWords = GetFourRandomWords();
                break;
            case "challenge":
                challengeHintsEl.textContent = challengeHints.toString();
                challengeTimeEl.textContent = FormatTime(challengeTime);
                ToggleClass(challengeEl, "hide", false);
                break;
            case "daily":
                pickedWords = GetDailyWords();
                gameState.gameStarted = true;
                break;
        }
        console.log("picked words are: " + pickedWords);
        combinedWord = CombineWords(pickedWords);
        startTimer();
        if (firstGame) {
            CreateLetterObjectsArray();
        }
        else {
            ResetLetterObjectsArray();
        }
        //randomize array order
        letterObjectsArray = Shuffle(letterObjectsArray);
        //add the corners and available letters to their spot
        placeLettersInGame();
        //update gamestate object and write it to localstorage
        setGameState();
        //event handler for selected by key
        document.addEventListener("keydown", SelectByKeyPress);
        letterObjectsArray.forEach((letter) => {
            if (!letter.isCorner && letter.letterElement) {
                letter.letterElement.addEventListener("click", (event) => {
                    SelectLetter(letter);
                });
            }
            MakeLettersPlaceable(letter);
        });
        firstGame = false;
    }
}
function giveUp() {
    if (isGameRunning) {
        letterObjectsArray.forEach((object, i) => {
            object.inputElement.value = object.letter;
            object.isFilled = true;
            object.isUsed = true;
        });
        ParseClasses();
        isGameRunning = false;
    }
}
function giveHint() {
    remainingLetters = letterObjectsArray.filter((obj) => !obj.isFilledByHint && !obj.isCorner);
    if (isGameRunning && remainingLetters.length > 2) {
        //get a random letter
        let index = Math.floor(Math.random() * remainingLetters.length);
        let randomLetter = remainingLetters[index];
        //if letter already used
        if (randomLetter.isUsed) {
            randomLetter.filledAt.isFilled = false;
            randomLetter.filledAt.inputElement.value = "";
        }
        //if spot already filled
        if (randomLetter.filledBy) {
            randomLetter.filledBy.isUsed = false;
        }
        //place the letter
        randomLetter.inputElement.value = randomLetter.letter;
        randomLetter.filledBy = randomLetter;
        randomLetter.isFilledByHint = true;
        randomLetter.isFilled = true;
        hintsUsed++;
        hintButton.innerHTML = `Hint (${remainingLetters.length - 3})`;
    }
    if (remainingLetters.length === 3) {
        hintButton.setAttribute("disabled", "");
    }
    ParseClasses();
}
function clearAll() {
    letterObjectsArray.forEach((letter) => {
        if (!letter.isCorner && !letter.isFilledByHint) {
            letter.inputElement.value = "";
            letter.filledBy = null;
            letter.filledAt = null;
            letter.isFilled = false;
            letter.isUsed = false;
        }
    });
    ParseClasses();
}
function checkWin() {
    if (isGameRunning) {
        var count = 0;
        letterObjectsArray.forEach((letter) => {
            if (letter.inputElement.value === letter.letter) {
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
            isGameRunning = false;
            randomGame = true; //make sure the next game will be random words again
            stopTimer();
            resultHints.textContent = hintsUsed.toString();
            resultTime.textContent = FormatTime(elapsedTime);
            resultWords.textContent = `${pickedWords[0]}, ${pickedWords[1]}, ${pickedWords[2]}, ${pickedWords[3]}`;
            ToggleClass(resultElement, "show", true);
        }
    }
}
function RestartGame() {
    startGame("random");
}
function cleanUpGame() {
    combinedWord = "";
    wrongAnswer.innerHTML = "";
    remainingLetters = null;
    hintsUsed = 0;
    hintButton.removeAttribute("disabled");
    hintButton.innerHTML = "Hint (6)";
    availableLettersElement.innerHTML = "";
    inputElements.forEach((input) => {
        const inputElement = input;
        inputElement.value = "";
        if (!input.classList.contains("corner")) {
            input.classList.remove("filled");
            input.classList.remove("filledByHint");
        }
    });
    document.removeEventListener("keydown", SelectByKeyPress);
    ToggleClass(resultElement, "show", false);
    ToggleClass(challengeEl, "hide", true);
    availableLettersElement.innerHTML = "";
    elapsedTime = 0;
}
function shareGame() {
    const dataStr = elapsedTime + "," + hintsUsed + "," + pickedWords.join(",");
    // encode the string to Base64
    const encodedData = btoa(dataStr);
    // construct the URL with the encoded data
    const urlName = window.location.origin + "/ qchallenge.html?data=" + encodedData;
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
// TIMER
let startTime; // to store the start time
let elapsedTime = 0; // to store the elapsed time in seconds
let timerInterval; // to store the interval ID for the setInterval function
function startTimer() {
    startTime = new Date(); // set the start time to the current time
    timerInterval = setInterval(updateTimer, 1000); // update the timer every second
}
function stopTimer() {
    clearInterval(timerInterval); // stop the interval
}
function updateTimer() {
    const now = new Date(); // get the current time
    elapsedTime = Math.floor((now.getTime() - startTime.getTime()) / 1000); // calculate the elapsed time in seconds
    mainTimer.textContent = FormatTime(elapsedTime);
}
// ******************* //
//if we are on the daily page, get the daily words
if (window.location.pathname === "/daily.html") {
    startGame("daily");
}
else if (window.location.pathname === "/challenge.html") {
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
        challengeTime = Number(dataSet[0]);
        challengeHints = Number(dataSet[1]);
        pickedWords = dataSet.splice(2);
        startGame("challenge");
    }
    else {
        // Generate a random game
        console.log("incorrect challengeLink");
        startGame("random");
    }
}
else {
    startGame("random");
}
restartButton.addEventListener("click", RestartGame);
submitButton.addEventListener("click", checkWin);
hintButton.addEventListener("click", giveHint);
clearButton.addEventListener("click", clearAll);
shareButton.addEventListener("click", shareGame);
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
