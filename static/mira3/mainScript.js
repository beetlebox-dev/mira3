
// (c) 2022 Johnathan Pennington | All rights reserved.


// CANVAS & CONTEXT
const canvas1 = document.getElementById('canvas1');
const ctx1 = canvas1.getContext('2d');
const canvas2 = document.getElementById('canvas2');
const ctx2 = canvas2.getContext('2d');


// HTML ELEMENTS
const hideBeforeImgLoadElems = document.querySelectorAll('.hide-before-img-load');
const toggleHideElems = document.querySelectorAll('.toggle-hide');
const bug = document.getElementById('bug');
const controlStrip = document.getElementById('control-strip');
const loadMoreButton = document.getElementById('load-more-button');
const uploadButton = document.getElementById('upload-button');
const downloadButton = document.getElementById('download-button');
const allSpeedButtons = document.querySelectorAll('.speed-button');  // Excludes stop button.
const stopButton = document.getElementById('stop');
const scrollArea = document.getElementById('scroll-area');
const scroller = document.getElementById('scroller');
const scrollLine = document.getElementById('scroll-line');
const userImage = new Image();


// LIVE STYLES
const controlStripStyle = window.getComputedStyle(controlStrip);
const scrollerStyle = window.getComputedStyle(scroller);


// SETTINGS
const maxPixelHeight = 720;  // Prevents excessive processing times.
const loopSecsBySpeed = [null, 9, 3, 1];  // Array containing the duration in seconds of a full loop of all frames (including uncalculated frames) for each speed level.
    // First index is always null, which is an empty placeholder (representing speed 0) for convenient indexing.
const buttonColor = 'hsl(267, 100%, 50%)';
const buttonColorFilter = 'invert(86%) sepia(100%) saturate(4013%) hue-rotate(265deg) brightness(95%) contrast(143%)';  // Change white to "indigo" hsl(267, 100%, 50%).


// STATE
const procConstData = {};
const procContinueData = {};
const frameChangeTiming = [0, 0];  // [total frame changes, total change msecs]
const frameLoadTiming = [0, 0];  // [total frame loads, total load msecs]
var framesPerLoadEst = -1;
var fileName = 'MIRA3_screenshot_';
var fileNum = 1;
var workerWorking = true;
var showOnlyXloadButtons = true;
var hidingControls = false;
var swapImages = false;
var mouseOverScrollArea = false;
var manualScrollInProgress = false;
var uploadButtonColorRotation = 170;  // Stores the upload button hue rotation while startUploadEnticeLoop() is running. Centered on 0 = "orange" (hue @ 39deg).
var totalFrameCount = -1;  // Init to number for scroller positioning.
var lastFrameJumpNum = -1
var userStartMsec = null;
var nextAlertMsec = null;
var imgProcWorker, imageDataCurrentFrame, imageDataDuotone, pixelsBinaryCurrentFrame, offRgb, onRgb, imgAspectRatio, uploadButtonEnticeLoopCancelId, controlStripPaddingLeft, 
scrollerPositionCoeff, scrollerWidth, msecsPerFrameBySpeed, autoscrollSpeed, currentFrameNum, animationDelayTimeout, totalFrameStepCount, frameRateReferenceTime, frameHistory;


// FRAME HISTORY
// Each element in frameHistory array represents a frame change. Index N holds data for the change between frame N and frame N+1.
// frameHistory = [frameTransition0-1, frameTransition1-2, frameTransition2-3, etc.]
// frameTransitionX-Y = [ Map(pixelNum, [rgbBefore, rgbAfter, flipCount]), etc.]
// RgbBefore and rgbAfter are arrays: [r, g, b]. If flipCount is odd, the color of the duotone image is swapped.


// EVENT LISTENERS

loadMoreButton.addEventListener('mousedown', event => {

    if (event.ctrlKey === false && event.button === 0 && workerWorking === false) {

        workerWorking = true;
        showOnlyXloadButtons = false;
        hidingControls = hidingControls === false;  // Will be flipped by toggleControlsVisibility() below.
        toggleControlsVisibility();

        if (imgProcWorker !== undefined) imgProcWorker.terminate();

        frameCountUpdate(totalFrameCount + procConstData.frameBatchCount - 1);

        // Send imageData to worker.
        imgProcWorker = new Worker('/static/mira3/imgProcWorker.js');
        imgProcWorker.onmessage = (message) => receiveWorkerMessage(message);
        const initialWorkerData = ['procContinue', canvas1.width, canvas1.height, procConstData, procContinueData];
        imgProcWorker.postMessage(initialWorkerData);
    };
});

window.addEventListener('resize', () => {
    recalculateScrollerPositioning();
    resizeBigCanvas();
});

document.getElementById('canvas1-container').addEventListener('mousedown', event => {
    if (event.ctrlKey === false && event.button === 0) toggleControlsVisibility();
});

canvas2.addEventListener('mousedown', event => {
    if (event.ctrlKey === false && event.button === 0) {
        swapImages = swapImages === false;
        drawScreens();
        adminAlert();
    };
});

uploadButton.addEventListener('mousedown', event => {
    if (event.ctrlKey === false && event.button === 0) uploadButtonClick();
});

// Upload button mouse hover.
uploadButton.addEventListener('mouseenter', () => {
    clearInterval(uploadButtonEnticeLoopCancelId);
    uploadButton.style.filter = 'none';
});
uploadButton.addEventListener('mouseleave', () => {
    if (uploadButtonEnticeLoopCancelId === null) uploadButton.style.filter = buttonColorFilter;
    else startUploadEnticeLoop();
});

downloadButton.addEventListener('mousedown', event => {
    if (event.ctrlKey === false && event.button === 0) downloadButtonClick();
});

// Speed/stop buttons mousedown.
for (const direction of ['backward', 'forward']) {
    for (let speed = 0; speed <= 3; speed++) {
        const speedButton = document.querySelector(`#${direction}${speed}`);
        const nextSpeed = (speed % 3 + 1) * {'backward': -1, 'forward': 1}[direction];
        speedButton.addEventListener('mousedown', event => {
            if (event.ctrlKey === false && event.button === 0) {
                changeAutoscrollSpeed(nextSpeed);
                adminAlert();
            };
        });
    };
};
stopButton.addEventListener('mousedown', event => {
    if (event.ctrlKey === false && event.button === 0) {
        changeAutoscrollSpeed(0);
        adminAlert();
    };
});

scrollArea.addEventListener('mouseenter', () => {
    mouseOverScrollArea = true;
    scroller.style.backgroundColor = 'white';
});
scrollArea.addEventListener('mouseleave', () => {
    mouseOverScrollArea = false;
    if (manualScrollInProgress === false) scroller.style.backgroundColor = buttonColor;
});

// Manual scroll.
scrollArea.addEventListener('mousedown', event => {
    if (event.ctrlKey === false && event.button === 0) startManualScroll(event.clientX);
});
scrollArea.addEventListener('touchstart', event => {
    event.preventDefault();
    scroller.style.backgroundColor = 'white';
    startManualScroll(event.touches[0].clientX);
});
window.addEventListener('mousemove', event => continueManualScroll(event.clientX));
window.addEventListener('touchmove', event => continueManualScroll(event.touches[0].clientX));
window.addEventListener('mouseup', endManualScroll);
window.addEventListener('touchend', endManualScroll);


// SCRIPT
loadImage('/static/mira3/startImage.png', false);
startUploadEnticeLoop();


// FUNCTIONS

function downloadButtonClick() {   
    changeAutoscrollSpeed(0); 
    const format = 'image/png';  // 'image/png', 'image/jpeg', 'image/webp', etc.
    const quality = 1;  // 0 <= Quality <= 1  // Optional argument. Less than 1 only for lossy formats.
    const url = canvas1.toDataURL(format, quality);
    const nameOfFile = `${fileName}${fileNum}`;
    downloadFileFromURL(url, nameOfFile);
    fileNum++;
};

function downloadFileFromURL(url, nameOfFile) {
    const downloadElement = document.createElement('a');
    downloadElement.setAttribute('href', url);
    downloadElement.setAttribute('download', nameOfFile);
    document.body.appendChild(downloadElement);
    downloadElement.click();
    downloadElement.remove();
};

function uploadButtonClick() {
    changeAutoscrollSpeed(0);
    document.querySelector('input').click();
};

function userImageSelected(event) {
    const fileList = event.target.files;
    if (fileList.length > 0) {
        const fileObj = fileList[0];
        if (fileObj.type.slice(0, 5) !== 'image') {
            alert('You must select an image file.');
        } else {
            fileName = fileObj.name.split('.')[0];
            fileNum = 1;
            const userImageSource = URL.createObjectURL(fileObj);
            loadImage(userImageSource);
            adminAlert(true);
        };
    };
};

function loadImage(source, escapeEnticeLoop=true) {

    if (imgProcWorker !== undefined) imgProcWorker.terminate();

    clearTimeout(animationDelayTimeout);

    if (escapeEnticeLoop) {
        // Change upload button to normal responsive styling.
        clearInterval(uploadButtonEnticeLoopCancelId);
        uploadButtonEnticeLoopCancelId = null;
        uploadButton.style.filter = buttonColorFilter;
    };

    // Reset controls visibility.
    workerWorking = true;
    showOnlyXloadButtons = true;
    hidingControls = false;  // Will NOT be flipped by toggleControlsVisibility() below, because showOnlyUploadButton above is true.
    toggleControlsVisibility();

    // Reset states.
    swapImages = false;
    frameHistory = [];
    msecsPerFrameBySpeed = [];
    autoscrollSpeed = 0;
    currentFrameNum = 0;
    totalFrameStepCount = 0;
    totalFrameCount = -1;
    frameChangeTiming[0] = 0;
    frameChangeTiming[1] = 0;
    frameLoadTiming[0] = 0;
    frameLoadTiming[1] = 0;
    framesPerLoadEst = -1;
    endManualScroll();
    updatePlaybackControlsStyling(0);

    // Load image.
    userImage.src = source;
    userImage.onload = afterImageLoad;
};

function afterImageLoad() {

    const imgHeight = Math.min(userImage.naturalHeight, maxPixelHeight);
    const imgWidth = Math.round(imgHeight * userImage.naturalWidth / userImage.naturalHeight);

    canvas1.height = imgHeight;
    canvas1.width = imgWidth;
    canvas2.height = imgHeight;
    canvas2.width = imgWidth;

    imgAspectRatio = imgWidth / imgHeight;

    resizeBigCanvas();

    // Draw userImage to extract imageData.
    ctx1.fillStyle = '#ffffff';
    ctx1.fillRect(0, 0, imgWidth, imgHeight);  // Place white in the background to handle any transparency in userImage.
    ctx1.drawImage(userImage, 0, 0, imgWidth, imgHeight);
    canvas1.style.display = 'block';
    procConstData.imageDataFirstFrame = ctx1.getImageData(0, 0, imgWidth, imgHeight).data;

    // Send imageData to worker.
    if (imgProcWorker !== undefined) imgProcWorker.terminate();
    imgProcWorker = new Worker('/static/mira3/imgProcWorker.js');
    imgProcWorker.onmessage = (message) => receiveWorkerMessage(message);
    const initialWorkerData = ['procInitial', imgWidth, imgHeight, procConstData.imageDataFirstFrame];
    imgProcWorker.postMessage(initialWorkerData);
};

function receiveWorkerMessage(message) {
    // Data types are received in this order: duotoneReady, frameData (once for each frame batch), workerDone.

    if (message.data[0] === 'frameData') {
        frameHistory.push(message.data[1]);
        updateScrollBarLength();

    } else if (message.data[0] === 'duotoneReady') {

        offRgb = message.data[1];
        onRgb = message.data[2];
        procConstData.frameBatchCount = message.data[3];
        procConstData.frameBatchSize = message.data[4];
        procConstData.flipOnOffPixels = message.data[5];
        procConstData.lightnessThreshold = message.data[6]; 
        procConstData.pixelsBinaryFirstFrame = message.data[7];

        loadFrame('first');
        ctx2.putImageData(imageDataDuotone, 0, 0);

        frameCountUpdate(message.data[3]);

        showOnlyXloadButtons = false;
        hidingControls = true;  // Will be flipped by toggleControlsVisibility() below.
        toggleControlsVisibility();

    } else if (message.data[0] === 'workerDone') {

        procContinueData.groupData = message.data[1];
        procContinueData.groupArrayByPixelNum = message.data[2];
        procContinueData.firstFramePixelNumByCalc = message.data[3];
        procContinueData.pixelsBinaryLastFrame = message.data[4];
        procContinueData.imageDataLastFrame = message.data[5];

        imgProcWorker.terminate();

        lastFrameJumpNum = totalFrameCount - 1;

        workerWorking = false;
        showOnlyXloadButtons = false;
        hidingControls = hidingControls === false;  // Will be flipped by toggleControlsVisibility() below.
        toggleControlsVisibility();
    };
};

function updateScrollBarLength() {
    const percentLoaded = 100 * frameHistory.length / (totalFrameCount - 1);
    scrollLine.style.width = `${percentLoaded}%`;
};

function frameCountUpdate(newFrameCount) {

    if (newFrameCount < 2) alert("The image selected doesn't have contrasting areas large enough to process.");

    msecsPerFrameBySpeed = [];
    for (const loopSecs of loopSecsBySpeed) {
        if (loopSecs === null) {
            msecsPerFrameBySpeed.push(null);
        } else {
            const frameMsecs = loopSecs * 1000 / newFrameCount;
            msecsPerFrameBySpeed.push(frameMsecs);
        };
    };

    totalFrameCount = newFrameCount;
    totalFrameStepCount = 0;  // Reset autoscroll speed calibration.

    recalculateScrollerPositioning();  // Uses totalFrameCount.
    updateScrollBarLength();
};

function updateImageDataDuotoneFromPixelsBinaryCurrentFrame() {
    // Initializes imageDataDuotone with offRgb and onRgb colors based on current values in pixelsBinaryCurrentFrame.
    imageDataDuotone = new ImageData(canvas1.width, canvas1.height);
    for (let pixelNum = 0; pixelNum < pixelsBinaryCurrentFrame.length; pixelNum++) {
        if (pixelsBinaryCurrentFrame[pixelNum] === 0) imageDataDuotone.data.set(offRgb, pixelNum * 4)
        else imageDataDuotone.data.set(onRgb, pixelNum * 4)
    };
};

function drawScreens() {
    if (swapImages === false) {
        ctx1.putImageData(imageDataCurrentFrame, 0, 0);
        ctx2.putImageData(imageDataDuotone, 0, 0); 
    } else {
        ctx1.putImageData(imageDataDuotone, 0, 0);
        ctx2.putImageData(imageDataCurrentFrame, 0, 0);
    };
};

function loadFrame(firstOrLast) {

    if (framesPerLoadEst === -1) performance.mark('loadFrameStart');

    if (firstOrLast === 'first') {
        imageDataCurrentFrame = new ImageData(procConstData.imageDataFirstFrame.slice(), canvas1.width);
        pixelsBinaryCurrentFrame = procConstData.pixelsBinaryFirstFrame.slice();
        updateImageDataDuotoneFromPixelsBinaryCurrentFrame();
    } else {
        // firstOrLast === 'last'
        imageDataCurrentFrame = new ImageData(procContinueData.imageDataLastFrame.slice(), canvas1.width);
        pixelsBinaryCurrentFrame = procContinueData.pixelsBinaryLastFrame.slice();
        updateImageDataDuotoneFromPixelsBinaryCurrentFrame();
    };

    if (framesPerLoadEst === -1) {
        performance.mark('loadFrameEnd');
        const procMsecs = performance.measure('loadFrame', 'loadFrameStart', 'loadFrameEnd').duration;
        performance.clearMarks();
        performance.clearMeasures();
        frameLoadTiming[0] += 1;
        frameLoadTiming[1] += procMsecs;
    };
};

function displayFrameNum(newFrameNum) {

    if (newFrameNum < 0) newFrameNum = frameHistory.length;
    else if (frameHistory.length < newFrameNum) newFrameNum = 0;

    let distFromCurrent = Math.abs(newFrameNum - currentFrameNum);

    if (framesPerLoadEst !== -1) {

        if (newFrameNum + framesPerLoadEst < distFromCurrent) {
            // It's estimated to be quicker getting to the new frame by first loading the saved frame.
            totalFrameStepCount = 0;  // Reset at frame jumps.
            loadFrame('first');
            currentFrameNum = 0;
            distFromCurrent = newFrameNum;

        } else if (lastFrameJumpNum > 0) {
            // A later saved frame is stored in memory from worker.
            const distFromSavedFrame = Math.abs(newFrameNum - lastFrameJumpNum);

            if (distFromSavedFrame + framesPerLoadEst < distFromCurrent) {
                // It's estimated to be quicker getting to the new frame by first loading the saved frame.
                totalFrameStepCount = 0;  // Reset at frame jumps.
                loadFrame('last');
                currentFrameNum = lastFrameJumpNum;
                distFromCurrent = distFromSavedFrame;
            };
        };
    };

    let start, end, direction, colorIndex;
    if (newFrameNum <= currentFrameNum) {
        start = 1;
        end = distFromCurrent;
        direction = -1;
        colorIndex = 0;
    } else {
        start = 0;
        end = distFromCurrent - 1;
        direction = 1;
        colorIndex = 1;
    };

    if (framesPerLoadEst === -1) performance.mark('changeFrameLoopStart');

    for (let offset = start; offset <= end; offset++) {

        const frameHistIndex = currentFrameNum + offset * direction;
        for (const pixelChange of frameHistory[frameHistIndex].entries()) {

            const pixelNum = pixelChange[0];
            const pixelData = pixelChange[1];  // [rgbBefore, rgbAfter, flipCount]
            const rgb = pixelData[colorIndex];

            imageDataCurrentFrame.data.set(rgb, pixelNum * 4);

            if (pixelData[2] % 2 === 1) {
                // Odd flip count means pixel is flipped.
                if (pixelsBinaryCurrentFrame[pixelNum] === 1) {
                    pixelsBinaryCurrentFrame[pixelNum] = 0;
                    imageDataDuotone.data.set(offRgb, pixelNum * 4);
                } else {
                    pixelsBinaryCurrentFrame[pixelNum] = 1;
                    imageDataDuotone.data.set(onRgb, pixelNum * 4);
                };
            };
        };
    };

    if (framesPerLoadEst === -1) {

        performance.mark('changeFrameLoopEnd');
        const procMsecs = performance.measure('changeFrameLoop', 'changeFrameLoopStart', 'changeFrameLoopEnd').duration;
        performance.clearMarks();
        performance.clearMeasures();
        frameChangeTiming[1] += procMsecs;

        const procFrames = Math.abs(newFrameNum - currentFrameNum);
        frameChangeTiming[0] += procFrames;

        if (frameChangeTiming[0] > 200 && frameLoadTiming[0] > 0) {
            // Enough frame changes and frame loads have been timed to set framesPerLoadEst.
            framesPerLoadEst = frameLoadTiming[1] * frameChangeTiming[0] / frameLoadTiming[0] / frameChangeTiming[1];
        };
    };

    currentFrameNum = newFrameNum;
    drawScreens();
    updateScrollerPosition();
};

function autoscrollLoop() {

    if (autoscrollSpeed !== 0) {

        let thisFrameStepCount, thisMsecDelay;

        if (totalFrameStepCount === 0) {
            frameRateReferenceTime = Date.now();  // Init frameRateReferenceTime on first iteration.
            thisFrameStepCount = 1;
            thisMsecDelay = 4;  // 4 msecs minimum delay enforced for recursive setTimeout.

        } else {

            const totalMsecs = Date.now() - frameRateReferenceTime;
            const msecsPerFrame = msecsPerFrameBySpeed[Math.abs(autoscrollSpeed)];
            const totalFrameStepCountTarget = totalMsecs / msecsPerFrame;

            if (totalFrameStepCountTarget < totalFrameStepCount + 1) {
                thisFrameStepCount = 1;
                thisMsecDelay = Math.min(Math.max(((totalFrameStepCount + 1) / totalFrameStepCountTarget - 1) * totalMsecs, 4), 80);
                    // 4 msecs minimum delay enforced for recursive setTimeout.
                    // Prevent outlier delays longer than 80 msecs.

            } else {
                // totalFrameStepCountTarget >= totalFrameStepCount + 1
                thisFrameStepCount = Math.floor(totalFrameStepCountTarget - totalFrameStepCount);
                thisMsecDelay = 4;  // 4 msecs minimum delay enforced for recursive setTimeout.
            };
        };

        totalFrameStepCount += thisFrameStepCount;

        if (autoscrollSpeed > 0) displayFrameNum(currentFrameNum + thisFrameStepCount);
        else displayFrameNum(currentFrameNum - thisFrameStepCount);
        
        if (autoscrollSpeed !== 0) animationDelayTimeout = setTimeout(autoscrollLoop, thisMsecDelay);  // Schedule next frame.
    };
};

function changeAutoscrollSpeed(newSpeed) {

    if (autoscrollSpeed !== newSpeed && frameHistory !== undefined && frameHistory.length > 0) {

        updatePlaybackControlsStyling(newSpeed);

        if (newSpeed === 0) {
            clearTimeout(animationDelayTimeout);
            autoscrollSpeed = 0;

        } else {

            totalFrameStepCount = 0;  // Reset frame timing tracking.

            if (autoscrollSpeed === 0) {
                autoscrollSpeed = newSpeed;
                autoscrollLoop();

            } else {
                autoscrollSpeed = newSpeed;
            };
        };
    };
};

function startUploadEnticeLoop() {
    // Global variables:
        // var uploadButtonEnticeLoopCancelId, uploadButtonColorRotation;
    // To temporarily escape loop, run: 
        // clearInterval(uploadButtonEnticeLoopCancelId);
    // To permanently escape loop, also run:
        // uploadButtonEnticeLoopCancelId = null;

    uploadButtonEnticeLoopCancelId = setInterval(function() {

        if (Math.random() > 0.02) {
            uploadButtonColorRotation = (uploadButtonColorRotation + 4) % 360;  // Gradual hue change.
        } else {
            uploadButtonColorRotation = (uploadButtonColorRotation + 133) % 360;  // Occasionally make big jumps in hue.
        };
        const filterValue = `invert(31%) sepia(47%) saturate(4070%) hue-rotate(1deg) brightness(106%) contrast(104%) hue-rotate(${uploadButtonColorRotation}deg)`;
        uploadButton.style.filter = filterValue;

    }, 40);
};

function toggleControlsVisibility() {

    if (showOnlyXloadButtons) {

        controlStrip.style.display = 'block';
        for (const element of [loadMoreButton, stopButton, ...allSpeedButtons, ...hideBeforeImgLoadElems]) {
            element.style.display = 'none';
        };

    } else {

        for (const element of hideBeforeImgLoadElems) {
            element.style.display = 'block';
        };
    
        if (hidingControls === false || workerWorking) loadMoreButton.style.display = 'none';
        else loadMoreButton.style.display = 'block';

        if (hidingControls) {
            for (const elem of toggleHideElems) {
                elem.style.display = 'block';
            };
        } else {
            for (const elem of toggleHideElems) {
                elem.style.display = 'none';
            };
        };

        updatePlaybackControlsStyling(autoscrollSpeed);

        hidingControls = hidingControls === false;  // Flip boolean.
    };
};

function updatePlaybackControlsStyling(speed) {

    for (const speedButton of allSpeedButtons) {
        speedButton.style.display = 'none';
        speedButton.style.opacity = 0.5;
    };

    stopButton.style.display = 'inline-block';
    stopButton.style.opacity = 0.5;

    const backwardButtonId = `#backward${Math.abs(Math.min(speed, 0))}`;
    const backwardButton = document.querySelector(backwardButtonId);
    backwardButton.style.display = 'inline-block';

    const forwardButtonId = `#forward${Math.abs(Math.max(speed, 0))}`;
    const forwardButton = document.querySelector(forwardButtonId);
    forwardButton.style.display = 'inline-block';

    if (speed > 0) {
        forwardButton.style.opacity = 1;
    } else if (speed < 0) {
        backwardButton.style.opacity = 1;
    } else {
        stopButton.style.opacity = 1;
    };
};

function startManualScroll(clientX) {
    if (frameHistory !== undefined && frameHistory.length > 0) {
        manualScrollInProgress = true;
        changeAutoscrollSpeed(0);
        continueManualScroll(clientX);
        adminAlert();
    };
};

function continueManualScroll(clientX) {
    if (manualScrollInProgress) {
        const manualFrameNum = Math.min(Math.max(Math.round((clientX - controlStripPaddingLeft - scrollerWidth / 2) / scrollerPositionCoeff), 0), frameHistory.length);
        displayFrameNum(manualFrameNum);
    };
};

function endManualScroll() {
    manualScrollInProgress = false;
    if (mouseOverScrollArea === false) scroller.style.backgroundColor = buttonColor;
};

function updateScrollerPosition() {
    const leftPlacement = currentFrameNum * scrollerPositionCoeff + controlStripPaddingLeft;
    scroller.style.left = `${leftPlacement}px`;
};

function recalculateScrollerPositioning() {
    // Needs to be called when totalFrameCount gets set/reset.
    // Otherwise, called with resize event listener.

    const controlStripWidth = pxStringToNum(controlStripStyle.getPropertyValue('width'));

    // Update global memory.
    scrollerWidth = pxStringToNum(scrollerStyle.getPropertyValue('width'));
    controlStripPaddingLeft = pxStringToNum(controlStripStyle.getPropertyValue('padding-left'));
    scrollerPositionCoeff = (controlStripWidth - scrollerWidth) / Math.max(totalFrameCount - 1, 1);

    updateScrollerPosition();

    function pxStringToNum(pxString) {
        // Pass in a string such as '123.45px'. Returns a number such as 123.45.
        return Number(pxString.split('px')[0]);
    };
};

function resizeBigCanvas() {
    // Need to be called manually when imgAspectRatio gets set.
    // Otherwise, called with resize event listener.

    canvas1.style.height = `${Math.min(window.innerHeight, window.innerWidth / imgAspectRatio)}px`;
    canvas1.style.width = `${Math.min(window.innerWidth, window.innerHeight * imgAspectRatio)}px`;
};

function adminAlert(userImageUploadAlert=false) {
    // Most user interactions with page will trigger an admin alert after the allotted alertSpacing time has elapsed.
    // Upload button clicks and hide controls clicks do not trigger an admin alert.
    // Requires initialized global variables below:
    // var userStartMsec = null;
    // var nextAlertMsec = null;

    let appName = 'MIRA3';
    if (userImageUploadAlert) appName += ' - User Image Upload';
    const firstAlertSecs = 20;  // Send first alert after X seconds.
    const alertSpacingFactor = 3;  // Exponential proportion for consecutive alert times.
    const maxSpacingMins = 5;  // A next alert will not be scheduled to be allowed greater than this duration in minutes.
    const idleMinsBeforeTimerReset = 5;  // If no alert activity happens this many minutes after the next alert is scheduled, userStartMsec is reset.

    if (userStartMsec === null) {
        // Set time for first alert.
        userStartMsec = Date.now();
        nextAlertMsec = Date.now() + firstAlertSecs * 1000;
    };

    if (userImageUploadAlert === false && Date.now() < nextAlertMsec) return;  // Not time for alert yet.

    if (nextAlertMsec + idleMinsBeforeTimerReset * 60000 < Date.now()) {
        // User idle beyond threshold. Reset alert timing.
        userStartMsec = Date.now();
        nextAlertMsec = Date.now() + firstAlertSecs * 1000;
    } else {
        const msecsSinceStart = Date.now() - userStartMsec;
        const msecsTillNextAlert = Math.min(Math.max(msecsSinceStart * alertSpacingFactor, firstAlertSecs * 1000), maxSpacingMins * 60000);
        nextAlertMsec = Date.now() + msecsTillNextAlert;
    };

    const request = new XMLHttpRequest();
    request.open("POST", '/serverterminal', true);
    request.setRequestHeader("Content-Type", "application/x-www-form-urlencoded");
    const userSecs = Math.floor((Date.now() - userStartMsec) / 1000);
    const requestContent = `appname=${appName}&userstartmsec=${userStartMsec}&usersecs=${userSecs}`;
    request.send(requestContent);
};
