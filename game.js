//npx http-server -c-1
//http://192.168.1.235:8080/?data=MTQsNixPSUxTLERJTlQsT1dFRCxTRUNU

import { fourLetterWords } from "./four-letter-words.js";


  const restartButton = document.getElementById("restartButton");
  const submitButton = document.getElementById("submitButton");
  const giveUpButton = document.getElementById("giveUpButton");
  const hintButton = document.getElementById("hintButton");
  const clearButton = document.getElementById("clearButton");
  const shareButton = document.getElementById("shareButton");
  const infoButton = document.getElementById("infoButton");
  const closeInfoButton = document.getElementById("i-close-button");
  const instructionsEl = document.getElementById("instructions");
  const form = document.querySelector("form");
  const inputElements = form.querySelectorAll('input[type="text"]');
  const avLettersEl = document.getElementById("availableLettersDiv");
  const wrongAnswer = document.getElementById("wrongAnswer");
  const resultElement = document.getElementById("result");
  const resultTime = document.getElementById("resultTime");
  const timer = document.getElementById("timer");
  const resultWords = document.getElementById("resultWords");
  const resultHints = document.getElementById("resultHints");
  const shareUrlElement = document.getElementById("share_url");
  const challengeEl = document.getElementById("challenge");
  const challengeNameEl = document.getElementById("challengeName");
  const challengeTimeEl = document.getElementById("challengeTime");
  const challengeHintsEl = document.getElementById("challengeHints");
  const corners = [0, 3, 8, 11];
  let challengeName;
  let challengeTime;
  let challengeHints;
  let pickedWords = ["test", "ever", "tape", "tear"];
  let combinedWord;
  let remainingLetters;
  let isGameRunning = false;
  let selectedLetter;
  let letterObjectsArray = [];
  let firstGame = true;
  let hintsUsed = 0;
  let randomGame = true;

  class LetterObject {
    constructor(param) {
      this.filledBy = param.filledBy;
      this.filledAt = param.filledAt;
      this.index = param.index;
      this.letter = param.letter;
      this.inputElement = param.inputElement;
      this.p_tag = param.p_tag;
      this.isCorner = param.isCorner;
      this.isFilled = param.isFilled;
      this.isFilledByHint = param.isFilledByHint;
      this.isAvailable = param.isAvailable;
      this.isUsed = param.isUsed;
      this.isSelected = param.isSelected;
      this.eventListenerCreated = param.eventListenerCreated;
    }
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
    } else {
      console.log("no word combo found");
      return GetFourRandomWords();
    }
  }

  function CombineWords(words) {
    let result =
      words[0] + words[2].charAt(1) + words[3].charAt(1) + words[2].charAt(2) + words[3].charAt(2) + words[1];
    return result;
  }

  function FormatTime(seconds) {
    const formatMinutes = Math.floor(seconds / 60).toString().padStart(2, "0");
    const formatSeconds = (seconds % 60).toString().padStart(2, "0");
    return `${formatMinutes}:${formatSeconds}`;
  }

  function Shuffle(array) {
    var m = array.length,
      t,
      i;

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
      } else {
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
        selectedLetter = "";
      } else {
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
      ToggleClass(obj.p_tag, "used", obj.isUsed);
      ToggleClass(obj.p_tag, "selected", obj.isSelected);
      ToggleClass(obj.p_tag, "filledByHint", obj.isFilledByHint);
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

  function startGame() {
    if (!isGameRunning) {
      console.log("starting game...");
      isGameRunning = true;
      cleanUpGame();
      wrongAnswer.innerHTML = "";
      ToggleClass(resultElement, "show", false);
      if (randomGame) {
        pickedWords = GetFourRandomWords();
        ToggleClass(challengeEl, "hide", true);
      } else {
        challengeHintsEl.textContent = challengeHints;
        challengeTimeEl.textContent = FormatTime(challengeTime);
        ToggleClass(challengeEl, "hide", false);
      }
      console.log("picked words are: " + pickedWords);
      combinedWord = CombineWords(pickedWords);
      avLettersEl.innerHTML = "";
      remainingLetters = combinedWord;
      elapsedTime = 0;
      startTimer();

      if (firstGame) {
        //create letter objects and put them in the array
        inputElements.forEach((input, index) => {
          letterObjectsArray.push(
            new LetterObject({
              filledBy: "",
              filledAt: "",
              index: index,
              letter: combinedWord[index],
              inputElement: input,
              p_tag: "",
              isCorner: corners.includes(index),
              isFilled: false,
              isFilledByHint: false,
              isAvailable: false,
              isUsed: false,
              isSelected: false,
            })
          );
        });
      } else {
        letterObjectsArray.sort((a, b) => a.index - b.index);
        letterObjectsArray.forEach((letter, index) => {
          letter.filledBy = "";
          letter.filledAt = "";
          letter.letter = combinedWord[index];
          letter.index = index;
          letter.isCorner = corners.includes(index);
          letter.inputElement = inputElements[index];
          letter.p_tag = "";
          letter.isFilled = false;
          letter.isFilledByHint = false;
          letter.isAvailable = false;
          letter.isUsed = false;
          letter.isSelected = false;
        });
      }

      //randomize array order

      letterObjectsArray = Shuffle(letterObjectsArray);

      console.log(letterObjectsArray);

      //add the corners and available letters to their spot
      for (const obj of letterObjectsArray) {
        if (obj.isCorner) {
          obj.inputElement.value = obj.letter;
        } else {
          const p = document.createElement("p");
          p.textContent = obj.letter;
          p.classList.add("letters");
          avLettersEl.appendChild(p);
          obj.p_tag = p;
        }
      }

      //randomize the letters
      // for (let i = 8; i >= 0; i--) {
      //   avLettersEl.appendChild(avLettersEl.children[(Math.random() * i) | 0]);
      // }

      //event handler for selected by key
      document.addEventListener("keydown", SelectByKeyPress);

      letterObjectsArray.forEach((letter) => {
        if (!letter.isCorner) {
          letter.p_tag.addEventListener("click", (event) => {
            SelectLetter(letter);
          });
        }

        // make letter placeable
        if (firstGame) {
          letter.inputElement.addEventListener("click", (event) => {
            if (!letter.isCorner && !letter.isFilledByHint) {
              //if there is a letter, return it
              if (letter.filledBy) {
                letter.isFilled = false;
                letter.filledBy.isUsed = false;
                letter.filledBy = "";
                letter.inputElement.value = "";
              }
              //if a letter is selected, place it
              if (selectedLetter) {
                letter.filledBy = selectedLetter;
                letter.inputElement.value = selectedLetter.letter;
                letter.isFilled = true;
                selectedLetter.filledAt = letter;
                selectedLetter.isSelected = false;
                selectedLetter.isUsed = true;
                selectedLetter = "";
                form.classList.remove("letterSelected");
              }
            }
            ParseClasses();
          });
        }
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
      hintButton.innerHTML = `Hint (${remainingLetters.length - 3})`
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
        letter.value = "";
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
        } else {
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

  function cleanUpGame() {
    combinedWord = "";
    remainingLetters = "";
    hintsUsed = 0;
    hintButton.removeAttribute("disabled", "");
    hintButton.innerHTML = "Hint (6)"
    avLettersEl.innerHTML = "";
    inputElements.forEach((input) => {
      input.value = "";
      if (!input.classList.contains("corner")) {
        input.classList.remove("filled");
        input.classList.remove("filledByHint");
      }
    });
    document.removeEventListener("click", SelectByKeyPress);
  }

  function shareGame() {
    const dataStr = elapsedTime + "," + hintsUsed + "," + pickedWords.join(",");

    // encode the string to Base64
    const encodedData = btoa(dataStr);

    // construct the URL with the encoded data
    const urlName = window.location.origin + "/?data=" + encodedData;
    const shareUrl = new URL(urlName);

    console.log(urlName);

    const searchParam = new URLSearchParams(shareUrl.search);
    const data = searchParam.get("data");
    console.log(atob(data));

    shareUrlElement.textContent = urlName;
    ToggleClass(shareUrlElement, "show", true);
    //if share api is available
    if (navigator.share) {
      navigator.share({
        title: "I challenge you to this game of Word Weaver!",
        url: shareUrl,
      });
    } else {
      console.log("Web Share API not supported");
      navigator.clipboard
        .writeText(shareUrl)
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
    elapsedTime = Math.floor((now - startTime) / 1000); // calculate the elapsed time in seconds
    timer.textContent = FormatTime(elapsedTime);
  }


  // ******************* //

  // Get the current URL
  const url = new URL(window.location.href);

  // Parse the query string
  const params = new URLSearchParams(url.search);

  // Check if the 'data' parameter is present and has a value
  if (params.has("data")) {
    const data = params.get("data");

    // Split the comma-separated values into an array
    const dataSet = atob(data).split(",");

    [challengeTime, challengeHints, ...pickedWords] = dataSet;
    randomGame = false;
  } else {
    // Generate a random game
    // ...
    console.log("normal game");
    randomGame = true;
  }

  startGame();

  restartButton.addEventListener("click", startGame);
  submitButton.addEventListener("click", checkWin);
  hintButton.addEventListener("click", giveHint);
  clearButton.addEventListener("click", clearAll);
  shareButton.addEventListener("click", shareGame);
  infoButton.addEventListener("click", event => {
    ToggleClass(instructionsEl, "hide", false);
  })
  closeInfoButton.addEventListener("click", event => {
    ToggleClass(instructionsEl, "hide", true);
  })
