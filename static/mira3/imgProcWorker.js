
// Copyright 2022 Johnathan Pennington | All rights reserved.


// ANIMATION
const imgChangeConstant = 40;  // Any positive number. Doubling this value will halve the total number of pixel changes made to the image across all frames.
const maxFrameBatchCount = 500;  // If frame count exceeds this, merge frames down to this limit by using a frameBatchSize greater than 1.
const minFrameBatchCount = 60;
const randPixelSampleCount = 10;  // Maximum number of random pixels to sample within queue before making choice in randPixel() in choosePixelToChange().
const maxClonePointers = 6;  // Once this many pointers are collected in determining which pixel to clone, no more pointers are evaluated/added.
const minCloneDistanceDiff = 0.3;  // Inverse of distances from clone pointers to candidate is used to weight candidate. This minimum prevents divide by 0 (infinite weighting) when distance is 0.
var frameBatchCount, frameBatchSize, currentFrameData;
    // Each element in the frameHistory array represents a frame change. Index N holds data for the change between frame N and frame N+1.
    // frameHistory = [frameTransition0-1, frameTransition1-2, frameTransition2-3, etc.]
    // frameTransitionX-Y = [ Map(pixelNum, [rgbBefore, rgbAfter, flipCount]), etc.]
    // RgbBefore and rgbAfter are arrays: [r, g, b]. If flipCount is odd, the color of the duotone image is swapped.


// IMAGE PROCESSING
const relMinGroupSize = 0.001;  // A ratio of the image's area.
const duotoneSampleCount = 400;  // The number of pixels to sample from image to determine the colors in the duotone image.
const satThreshold = 30;  // If satThreshold is X, the average saturation of sampled pixels must be more than X to choose a pure hue.
const surroundingCoords = [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1], [0, 0]];
    // Lists in reading order the relative coordinates of all pixels adjacent to a center pixel at [0, 0]. Center pixel is skipped and added at end.
    // Can be in more local scope???? ///debugdebug
const perimChangeKey = [null, 2, 1.414, 0.707, 0, -0.707, -1.414, -2, null];  // Used to track perimeter changes of groups when adding/removing pixels.
    // Indexed by neighbor ON-pixel count for adding pixels. Use reverse order for removing pixels.
const pointerDistKey = [2.83, 2.24, 2.00, 2.24, 2.83, 2.24, 1.41, 1.00, 1.41, 2.24, 2.00, 1.00, 
    1.00, 2.00, 2.24, 1.41, 1.00, 1.41, 2.24, 2.83, 2.24, 2.00, 2.24, 2.83];
    // Storing the distances to the central pixel within a 5-by-5 surrounding area, listed in reading order.
    // Excludes center (distance of 0). Corresponds to the output of pixelArrayFromGrid() with radius=2.
var groupData, groupArrayByPixelNum, firstFramePixelNumByCalc, pixelsBinaryFirstFrame, pixelsBinaryCalc, 
imageDataFirstFrame, imageDataCalc, flipOnOffPixels, imgPixelCount, absMinGroupSize, smallestPossPerim, lightnessThreshold;
    // For calculating lightnessThreshold, the lightness value of 1000 pixels are sampled, but sample count is not to exceed 10% of the images pixel count.


// EVENT LISTENER - Handle data received from main thread.
onmessage = function(workerData) {
    // workerData = [imageWidth, imageHeight, imageData];

    if (workerData.data[0] === 'procInitial') {

        imageWidth = workerData.data[1];
        imageHeight = workerData.data[2];
        imageDataFirstFrame = workerData.data[3];
        imageDataCalc = workerData.data[3].slice();

        imgPixelCount = imageWidth * imageHeight;
        absMinGroupSize = relMinGroupSize * imgPixelCount;
        smallestPossPerim = Math.max(Math.sqrt(absMinGroupSize) * 4 - 4, 1);

        groupData = new Map();
        groupArrayByPixelNum = new Map();
        firstFramePixelNumByCalc = [];
        pixelsBinaryCalc = [];

        afterImageLoad();
    
    } else if (workerData.data[0] === 'procContinue') {

        imageWidth = workerData.data[1];
        imageHeight = workerData.data[2];

        frameBatchCount = workerData.data[3].frameBatchCount;
        frameBatchSize = workerData.data[3].frameBatchSize;
        flipOnOffPixels = workerData.data[3].flipOnOffPixels;
        lightnessThreshold = workerData.data[3].lightnessThreshold;
        imageDataFirstFrame = workerData.data[3].imageDataFirstFrame;
        pixelsBinaryFirstFrame = workerData.data[3].pixelsBinaryFirstFrame;

        groupData = workerData.data[4].groupData;
        groupArrayByPixelNum = workerData.data[4].groupArrayByPixelNum;
        firstFramePixelNumByCalc = workerData.data[4].firstFramePixelNumByCalc;
        pixelsBinaryCalc = workerData.data[4].pixelsBinaryLastFrame;
        imageDataCalc = workerData.data[4].imageDataLastFrame;

        imgPixelCount = imageWidth * imageHeight;
        absMinGroupSize = relMinGroupSize * imgPixelCount;
        smallestPossPerim = Math.max(Math.sqrt(absMinGroupSize) * 4 - 4, 1);

        calcFrames();
    };
};


// MAIN FUNCTIONS

function afterImageLoad() {

    // Calculate duotone image threshold.
    // The lightness value of 1000 pixels are sampled, but sample count is not to exceed 10% of the images pixel count.
    const sampleCount = Math.min(Math.ceil(imgPixelCount / 10), 1000);  // Sample 1000 pixels, not to exceed 10% of the images pixel count.
    const lightnessSamples = [];
    for (let i = 0; i < sampleCount; i++) {
        const randPixel = Math.floor(Math.random() * imgPixelCount);
        const lightness = getPixelLightness(randPixel);
        lightnessSamples.push(lightness);
    };

    // Determine whether or not to flip on/off pixels, and determine lightness threshold.
    lightnessSamples.sort(sortAscendCompareFunc);
    const centerIndex = Math.floor(sampleCount / 2);
    flipOnOffPixels = lightnessSamples[centerIndex] < 128;  // If the majority of pixels are ON, flip pixel values to minimize ON-pixel count.
    lightnessThreshold = findPartitionThreshold(lightnessSamples, 50, false);

    // Populate firstFramePixelNumByCalc and pixelsBinaryCalc.
    for (let pixelNum = 0; pixelNum < imgPixelCount; pixelNum++) {
        firstFramePixelNumByCalc.push(pixelNum);
        if (onPixel(pixelNum) === flipOnOffPixels) pixelsBinaryCalc.push(0);  // Pixel is off.
        else pixelsBinaryCalc.push(1);  // Pixel is on.
    };

    initGroupData();

    pixelsBinaryFirstFrame = pixelsBinaryCalc.slice();  // Groups are merged in initGroupData(). Pixel polarity can be flipped before initGroupData() is run.
        // Pixels0or1calc is used dynamically to calculate animation to the end, whereas pixelsBinaryFirstFrame is left unchanged and used to check original pixel states.

    //
    // Calculate colors of duotone image.

    const hueSamples = [[], []];
    const satSamples = [[], []];
    for (let i = 0; i < duotoneSampleCount; i++) {
        const randPixelNum = Math.floor(Math.random() * imgPixelCount);
        const sampIndex = pixelsBinaryCalc[randPixelNum];
        const rgb = imageDataFirstFrame.slice(randPixelNum * 4, randPixelNum * 4 + 3);
        const hsl = rgbToHsl(rgb);
        hueSamples[sampIndex].push(hsl[0]);
        satSamples[sampIndex].push(hsl[1]);
    };

    // Handle if no samples were collected for on or off pixels.
    for (const offOnIndex of [0, 1]) {
        if (hueSamples[offOnIndex].length === 0) {
            hueSamples[offOnIndex].push(0);
            satSamples[offOnIndex].push(0);
        };
    };

    const circMeanResult = [
        weightedCircularMeanDegrees(hueSamples[0], satSamples[0]),
        weightedCircularMeanDegrees(hueSamples[1], satSamples[1]),
        // circMeanResult = [[offHueMean, offSatMean], [onHueMean, onSatMean]]
    ];

    let offRgb, onRgb;
    if (circMeanResult[1][1] < circMeanResult[0][1] && satThreshold < circMeanResult[0][1]) {
        // Average saturation of OFF-pixels is greater than ON-pixels and satThreshold.
        const hsl = [circMeanResult[0][0], 100, 50];
        offRgb = hslToRgb(hsl);  // Full saturation
        offRgb.push(255);
    } else if (flipOnOffPixels) {
        offRgb = [0, 0, 0, 255];  // Black
    } else {
        offRgb = [255, 255, 255, 255];  // White
    };
    if (circMeanResult[0][1] < circMeanResult[1][1] && satThreshold < circMeanResult[1][1]) {
        // Average saturation of ON-pixels is greater than OFF-pixels and satThreshold.
        const hsl = [circMeanResult[1][0], 100, 50];
        onRgb = hslToRgb(hsl);  // Full saturation
        onRgb.push(255);
    } else if (flipOnOffPixels) {
        onRgb = [255, 255, 255, 255];  // White
    } else {
        onRgb = [0, 0, 0, 255];  // Black
    };


    postMessage(['duotoneReady', offRgb, onRgb, frameBatchCount, frameBatchSize, flipOnOffPixels, lightnessThreshold, pixelsBinaryFirstFrame]);

    // End block.
    //

    calcFrames();
};


function initGroupData() {

    const firstFramePixelsByGroup = new Map();

    // Add primary group to group data.
    for (let rootPixel = 0; rootPixel < imgPixelCount; rootPixel++) {  // (rootPixel === -1) represents the OFF-pixel group that touches the edge.

        if (groupArrayByPixelNum.has(rootPixel)) continue;  // Skip pixels already evaluated.

        let onPixelGroup = pixelsBinaryCalc[rootPixel] === 1;

        let groupNum, compositeGroupNum;
        if (onPixelGroup) {
            groupNum = rootPixel + 1;
            compositeGroupNum = [groupNum, 0];
        } else {
            groupNum = -rootPixel - 1;  // Groups of off pixels are negative.
            compositeGroupNum = [0, groupNum];
        };

        // GroupNum is initially set based on the lowest pixel number member (may change after group merges).
        // ON-pixel groupNum = rootPixel + 1  (>= 1)
        // OFF-pixel groupNum = -rootpixel - 1  (<= -1)
        // If a pixel is fixed, the secondary group id in composite group is set to 0.
        
        groupArrayByPixelNum.set(rootPixel, compositeGroupNum);
        firstFramePixelsByGroup.set(groupNum, new Set([rootPixel]));
        let sizeOfGroup = 0;
        let edgePixels = new Set();
        let visitNow = new Set([rootPixel]);

        for (;;) {
            // Continuous breadth-first search through pixels connected within group.

            let visitNext = new Set();  // VisitNext is added to throughout iteration, and is moved to visitNow at the end of each iteration.
            // Loop ends if an iteration completes and visitNext is empty.

            for (const currentPixel of visitNow) {

                sizeOfGroup++;

                const neighborPixels = getSideNeighbors(currentPixel);
                for (const neighbor of neighborPixels) {

                    const neighborOnPixel = pixelsBinaryCalc[neighbor] === 1;

                    if (onPixelGroup !== neighborOnPixel) {
                        edgePixels.add(neighbor);
                        continue;  // Skip pixels not relevant to this group's pixel type.
                    };

                    if (groupArrayByPixelNum.has(neighbor)) {

                        const neighborCompositeGroup = groupArrayByPixelNum.get(neighbor);
                        const neighborSimpleGroup = neighborCompositeGroup[0] + neighborCompositeGroup[1];  // Secondary group is zero at this point.

                        if (neighborSimpleGroup === groupNum) continue;  // Skip pixels already evaluated in same group.

                        // Merge current group pixels with neighbor's group.
                        sizeOfGroup += firstFramePixelsByGroup.get(neighborSimpleGroup).size;
                        for (const pixel of firstFramePixelsByGroup.get(groupNum)) {
                            groupArrayByPixelNum.set(pixel, neighborCompositeGroup);
                            firstFramePixelsByGroup.get(neighborSimpleGroup).add(pixel);
                        };
                        firstFramePixelsByGroup.delete(groupNum);
                        groupNum = neighborSimpleGroup;  // RootPixel is -1, representing the OFF-pixel group that touches the edge. Add all edge pixels to neighborPixels for evaluation.
                        compositeGroupNum = neighborCompositeGroup;
                        continue;
                    };

                    groupArrayByPixelNum.set(neighbor, compositeGroupNum);
                    firstFramePixelsByGroup.get(groupNum).add(neighbor);
                    visitNext.add(neighbor);
                };
            };

            if (visitNext.size > 0) {
                visitNow = visitNext;  // Restart loop with next generation.

            } else if (sizeOfGroup < absMinGroupSize) {
                // Minimum group size not reached. Flip group polarity for pixels added so far, and setup parameters to continue loop.

                const oldGroupNum = groupNum;

                let newPixelMonoValue;
                if (onPixelGroup) {
                    onPixelGroup = false;  // Flip boolean.
                    newPixelMonoValue = 0;  // Flip pixel polarity.
                    groupNum = -rootPixel - 1;  // OFF-pixel groups are negative.
                    compositeGroupNum = [0, groupNum];  // OFF-pixel groups are in 2nd index.
                } else {
                    onPixelGroup = true;  // Flip boolean.
                    newPixelMonoValue = 1;  // Flip pixel polarity.
                    groupNum = rootPixel + 1;  // ON-pixel groups are positive.
                    compositeGroupNum = [groupNum, 0];  // ON-pixel groups are in 1st index.
                };

                if (firstFramePixelsByGroup.has(groupNum)) throw 'it has sometimes';  //debugdebug
                else firstFramePixelsByGroup.set(groupNum, new Set());

                for (const pixel of firstFramePixelsByGroup.get(oldGroupNum)) {
                    pixelsBinaryCalc[pixel] = newPixelMonoValue;  // Flip on/off pixel.
                    groupArrayByPixelNum.set(pixel, compositeGroupNum);
                    firstFramePixelsByGroup.get(groupNum).add(pixel);
                };
                firstFramePixelsByGroup.delete(oldGroupNum);
                visitNow = edgePixels;
                edgePixels = new Set();

            } else {
                // All group pixels identified and minimum group size reached. Break to the next group loop.
                break;
            };
        };
    };

    // Add groupByPixelNum, secondary group, border count, and add/remove queues to group data.
    for (let rootPixel = 0; rootPixel < imgPixelCount; rootPixel++) {

        const neighborsOfRootPixel = getAllNeighbors(rootPixel, true);  // Corner pixels just used to calculate rootPixelFixed.
        const rootPixelFixed = pixelFixed(rootPixel, neighborsOfRootPixel);
        const sideNeighborsOfRootPixel = extractSideNeighbors(neighborsOfRootPixel);
        const adjacentGroups = calcAdjacentGroups(rootPixel, sideNeighborsOfRootPixel);

        for (const adjacentGroup of adjacentGroups) {
            const adjacentGroupStr = groupArrayToStr(adjacentGroup);
            if (groupData.has(adjacentGroupStr) === false) {
                groupData.set(adjacentGroupStr, new Map([
                    ['borderCount', 0],
                    ['latestPerimChange', 0],
                    ['prevPerimChange', null],
                    ['dynamicWeightBase', null],
                    ['lastAdded', new Set()],
                    ['lastRemoved', new Set()],
                    ['addQueue', new Set()],
                    ['removeQueue', new Set()],
                    // Keys added later: 'sampleRadius', 'numPixelsToChange'
                ]));
            };

            // Root pixel is on this group's border. Add 0.5 to border count of group.
            const adjacentGroupMap = groupData.get(adjacentGroupStr);
            const prevBorderCount = adjacentGroupMap.get('borderCount');
            adjacentGroupMap.set('borderCount', prevBorderCount + 0.5);
        };

        if (rootPixelFixed) { continue; };  // Secondary group is already set to 0, which is always the case for fixed pixels.
        // If root pixel not fixed, proceed to set secondary group, update groupArrayByPixelNum and populate add and remove queues below.

        const compositeGroup = adjacentGroups[0];  // Root pixel is not fixed, so adjacentGroups array must contain exactly 1 group.
        const compositeGroupStr = groupArrayToStr(compositeGroup);
        const groupMap = groupData.get(compositeGroupStr);
        const rootPixelOn = pixelsBinaryCalc[rootPixel] === 1;
        groupArrayByPixelNum.set(rootPixel, compositeGroup);

        // Populate add or remove queue.
        if (rootPixelOn) groupMap.get('removeQueue').add(rootPixel);
        else groupMap.get('addQueue').add(rootPixel);
    };

    // Add sampleRadius and numPixelsToChange to group data.
    let pixelChangesPerFrame = 0;
    let totalBorderPixels = 0;
    for (const groupInfo of groupData.values()) {
        const borderCount = groupInfo.get('borderCount');
        totalBorderPixels += borderCount;
        const radius = Math.floor((borderCount - 4) / 16);
            // The "radius" of a square with half the side length of a square that has this group's border count.
            // Attempting to sample a significant portion of the group without trivially oversampling close to the entire group.
        const radiusMinMax = Math.min(Math.max(radius, 1), 3);  // Radius constrained to min & max. Always disallow 0.
        groupInfo.set('sampleRadius', radiusMinMax);
        const numPixToChange = numPixelsToChange(borderCount);
        groupInfo.set('numPixelsToChange', numPixToChange);
        pixelChangesPerFrame += numPixToChange;
    };

    const numPixelChangesTotal = Math.sqrt(imgPixelCount) * totalBorderPixels / imgChangeConstant;
    const totalFrameCalculationCount = numPixelChangesTotal / pixelChangesPerFrame;
    frameBatchSize = Math.ceil(totalFrameCalculationCount / maxFrameBatchCount);
    frameBatchCount = Math.max(Math.ceil(totalFrameCalculationCount / frameBatchSize) + 1, minFrameBatchCount);

    if (isNaN(frameBatchSize) || isNaN(frameBatchCount)) {
        frameBatchSize = 1;
        frameBatchCount = 1;
    };
};


function calcFrames() {
    for (let i = 1; i < frameBatchCount; i++) {
        calcNextBatch();
    };
    postMessage(['workerDone', groupData, groupArrayByPixelNum, firstFramePixelNumByCalc, pixelsBinaryCalc, imageDataCalc]);
};


function calcNextBatch() {
    // Nested functions: calcNextBatch (loop for all groups) > calcNextFrameGroup (one group) > calcNextFrameGroupIter (one iteration in one group; either add or remove)
    currentFrameData = new Map();
    for (let subFrames = 0; subFrames < frameBatchSize; subFrames++) {
        for (const groupStr of groupData.keys()) {
            calcNextBatchGroup(groupStr);
        };
    };
    postMessage(['frameData', currentFrameData]);
};


function calcNextBatchGroup(groupStr) {
    // GroupStr is a string of the type created by groupArrayToStr().

    const groupMap = groupData.get(groupStr);

    //
    // Change dynamicWeightBase.

    const latestBorderChange = groupMap.get('latestPerimChange');
    const prevBorderChange = groupMap.get('prevPerimChange');
    let newWeightBase;

    // Make a bigger change to weightings if moving farther from target, and a smaller change if moving closer to target.
    let change;
    if (Math.abs(latestBorderChange) > Math.abs(prevBorderChange)) change = 4;
    else change = 2;

    if (prevBorderChange === null) {
        // Init weight base.
        newWeightBase = 8192;  // 8192 = 8^4 * 2

    } else if (latestBorderChange < prevBorderChange) {
        // Border is shrinking. Decrease weight base.
        newWeightBase = Math.max(groupMap.get('dynamicWeightBase') / change, 2);  // Enforce minimum weight base.

    } else {
        // Border is growing (or staying the same). Increase weight base.
        newWeightBase = Math.min(groupMap.get('dynamicWeightBase') * change, 268435456);  // Enforce maximum weight base. 268435456 = 2^28
    };

    groupMap.set('dynamicWeightBase', newWeightBase);  // Using this updated value in choosePixelToChange().
    groupMap.set('prevPerimChange', latestBorderChange);  // Old latest becomes previous. New latest gets updated throughout iteration.

    // End block.
    //
    // Determine how many random pixels to force, if any.

    const relBorderChange = latestBorderChange / groupMap.get('borderCount');  // Only engage random pixel to decrease border size. If latestBorderChange is negative, if block below is passed.
    const maxRandPixelRatio = 0.2;  // 0 <= maxRandPixelRatio <= 1  // A proportion of the number of pixels to be changed to be forced to be random.
    const minThresRatio = 0.2;  // A ratio of border size before which no random pixels are forced.
    const maxThresRatio = 0.4;  // A ratio of border size at which the maximum number of random pixels are forced.
        // 0 < minThresRatio < maxThresRatio
    
    if (minThresRatio < relBorderChange) {
        const randPixelRatio = Math.min((relBorderChange - minThresRatio) / (maxThresRatio - minThresRatio), 1) * maxRandPixelRatio;
        for (const lastAddedOrRemoved of ['lastAdded', 'lastRemoved']) {
            const lastChangedArray = groupMap.get(lastAddedOrRemoved);
            // Not shuffling array so that more non-random changes can remain localized.
            // shuffleArray(lastChangedArray);
            const spliceStart = Math.floor(lastChangedArray.length * (1 - randPixelRatio));
            lastChangedArray.splice(spliceStart);
        };
    };

    // End block.
    //

    const pixelsAddedMemory = new Set();
    const pixelsRemovedMemory = new Set();
    const trashBin = new Set();
    const lastAddedArray = groupMap.get('lastAdded');
    const lastRemovedArray = groupMap.get('lastRemoved');
    const groupArray = groupStrToArray(groupStr);

    for (let iterNum = 0; iterNum < groupMap.get('numPixelsToChange'); iterNum++) {

        let lastAdded = null;
        let lastRemoved = null;
        if (iterNum < lastAddedArray.length) lastAdded = lastAddedArray[iterNum];
        if (iterNum < lastRemovedArray.length) lastRemoved = lastRemovedArray[iterNum];
        // Else, last added/removed is left at null, and choosePixelToChange() will select from a random sample of pixels within the group's queue.

        const addedPixel = calcNextBatchGroupIter(groupMap, groupStr, groupArray, lastAdded, 'add');
        const removedPixel = calcNextBatchGroupIter(groupMap, groupStr, groupArray, lastRemoved, 'remove');

        if (pixelsRemovedMemory.has(addedPixel)) {
            pixelsRemovedMemory.delete(addedPixel);
            trashBin.add(addedPixel);
        } else if (trashBin.has(addedPixel) === false) {
            pixelsAddedMemory.add(addedPixel);
        };

        if (pixelsAddedMemory.has(removedPixel)) {
            pixelsAddedMemory.delete(removedPixel);
            trashBin.add(removedPixel);
        } else if (trashBin.has(removedPixel) === false) {
            pixelsRemovedMemory.add(removedPixel);
        };
    };

    groupMap.set('lastAdded', Array.from(pixelsAddedMemory));
    groupMap.set('lastRemoved', Array.from(pixelsRemovedMemory));
};


function calcNextBatchGroupIter(groupMap, groupStr, groupArray, lastAddRemovePixel, addOrRemove) {
    // Returns nextPixelToFlip pixel number.
    // AddOrRemove is a string, either 'add' or 'remove'.

    let startQueue, endQueue, pixelBit, inversePixelBit;
    if (addOrRemove === 'add') {
        startQueue = 'addQueue';
        endQueue = 'removeQueue';
        pixelBit = 1;
        inversePixelBit = 0;
    } else {
        startQueue = 'removeQueue';
        endQueue = 'addQueue';
        pixelBit = 0;
        inversePixelBit = 1;
    };

    let vicinityOfLastFlipped;
    if (lastAddRemovePixel !== null) {
        const gridRadius = Math.max(groupMap.get('sampleRadius') + 1, 3);  // Need at least a radius of 3: lastAddRemovePixel > nextPixelToFlip > checkPixel > checkPixelNeighbor.
        vicinityOfLastFlipped = createGrid(lastAddRemovePixel, gridRadius);
        // If on the rare occasion queue is empty, vicinityOfLastFlipped is ultimately not needed. But I will assume it may be more expensive to check for that here every time rather than to just run choosePixelToChange() regardless.
    };
    // Else, vicinityOfLastFlipped is not used because randPixel() is called in choosePixelToChange().

    const chooseResult = choosePixelToChange(lastAddRemovePixel, vicinityOfLastFlipped, addOrRemove, groupStr);
    const nextPixelToFlip = chooseResult[0];

    let vicinityOfNextToFlip;  // Grid with radius of 2 because: nextPixelToFlip > checkPixel > checkPixelNeighbor.
    if (chooseResult[1] !== true && chooseResult[1] !== false) {
        // ChooseResult[1] is an array [x, y], and indicates the coordinates of nextPixelToFlip within vicinityOfLastFlipped.
        // Can use these coordinates to generate vicinityOfNextToFlip from vicinityOfLastFlipped.
        vicinityOfNextToFlip = subGridFromGrid(vicinityOfLastFlipped, chooseResult[1], 2);
    } else if (chooseResult[1] === true) {
        // NextPixelToFlip was selected randomly and could be off of nearbyGrid, therefore vicinityOfNextToFlip should be calculated from scratch.
        vicinityOfNextToFlip = createGrid(nextPixelToFlip, 2);
    };
    // Else, chooseResult[1] is false, and no nextPixelToFlip was found (returned null), therefore vicinityOfNextToFlip will not be needed.

    if (nextPixelToFlip === null) return null;

    const adjacentNeighborsOfFlipped = pixelArrayFromGrid(vicinityOfNextToFlip, [0, 0]);

    // Update perimeter length.
    const flippedNeighborsOnCount = countOnPixels(adjacentNeighborsOfFlipped);
    const newPerimeterChange = groupMap.get('latestPerimChange') + perimChangeKey[flippedNeighborsOnCount] * (pixelBit * 2 - 1);  // Subtracts perimChangeKey value when removing.
    groupMap.set('latestPerimChange', newPerimeterChange);

    // Transfer to opposite queue.
    const groupStrOfFlipped = groupArrayToStr(groupArrayByPixelNum.get(nextPixelToFlip));
    changeQueue(nextPixelToFlip, groupStrOfFlipped, groupStrOfFlipped, startQueue, endQueue);

    //
    // Determine which existing pixel from group to clone.

    const pointers = new Map();
    const candidatePixels = new Set();
    const areaAroundFlipped = pixelArrayFromGrid(vicinityOfNextToFlip, [0, 0], 2);
    const adjacentIndices = [6, 7, 8, 11, 13, 16, 17, 18];
    const distantIndices = [0, 1, 2, 3, 4, 5, 9, 10, 14, 15, 19, 20, 21, 22, 23, 24];

    for (const indexArray of [adjacentIndices, distantIndices]) {

        shuffleArray(indexArray);

        for (const index of indexArray) {

            const neighbor = areaAroundFlipped[index];

            if (neighbor === null) continue;
            if (pixelsBinaryCalc[neighbor] !== pixelBit) continue;  // Skip pixels of wrong polarity.
            if (groupArrayByPixelNum.get(neighbor)[inversePixelBit] !== groupArray[inversePixelBit]) continue;
            
            const ogPixel = firstFramePixelNumByCalc[neighbor];

            const pointerDist = pointerDistKey[index];
            if (pointers.has(ogPixel)) pointers.get(ogPixel).push(pointerDist);
            else pointers.set(ogPixel, [pointerDist]);
                // Handling when the same ogPixel is in areaAroundFlipped multiple times.

            const ogNeighbors = getAllNeighbors(ogPixel);
            ogNeighbors.push(ogPixel);  // Adding ogPixel itself in candidatePixels.
            for (const ogNeighbor of ogNeighbors) {
                if (pixelsBinaryFirstFrame[ogNeighbor] === pixelBit) candidatePixels.add(ogNeighbor);  // Skip pixels of wrong polarity.
            };

            if (pointers.size >= maxClonePointers) break;
        };

        if (pointers.size >= maxClonePointers) break;
    };

    let bestCandidateWeight = -1;
    let bestCandidatePixelNums = [];
    for (const candidate of candidatePixels) {

        let candidateWeight = 0;

        for (const pointerKey of pointers.keys()) {
            const targetDist = pixelDistance(pointerKey, candidate);
            for (const actualDist of pointers.get(pointerKey)) {
                const distanceDiff = Math.max(Math.abs(actualDist - targetDist), minCloneDistanceDiff);
                const pointerCandidateWeight = 1 / distanceDiff / actualDist;
                candidateWeight += pointerCandidateWeight;
            };
        };

        if (candidateWeight > bestCandidateWeight) {
            bestCandidateWeight = candidateWeight;
            bestCandidatePixelNums = [candidate];
        } else if (candidateWeight === bestCandidateWeight) {
            bestCandidatePixelNums.push(candidate);
        };
    };

    let pixelToClone = null;

    if (bestCandidatePixelNums.length > 0) {
        pixelToClone = randChoice(bestCandidatePixelNums);

    } else if (candidatePixels.size > 0) {

        let optionB = null;  // Stores og pixels that would repeat an adjacent pixel, only choosing from here if no other alternative exists.
        const candidatesArray = Array.from(candidatePixels);
        shuffleArray(candidatesArray);
        for (const candidate of candidatesArray) {
            if (pointers.has(candidate)) {
                if (optionB !== null) optionB = candidate;  // CandidatesArray is in random order, so just store first candidate that meets criteria.
                continue;
            };
            pixelToClone = candidate;
            break;
        };

        if (pixelToClone === null) pixelToClone = optionB;
    };

    if (pixelToClone === null) {
        // Choose random pointer.
        const allPointers = Array.from(pointers.keys());
        pixelToClone = randChoice(allPointers);
    };

    // End block.
    //
    // Update image data.

    firstFramePixelNumByCalc[nextPixelToFlip] = pixelToClone;
    pixelsBinaryCalc[nextPixelToFlip] = pixelBit;

    const cloneRgbStart = pixelToClone * 4;
    const rgbAfter = imageDataFirstFrame.slice(cloneRgbStart, cloneRgbStart + 3);

    if (currentFrameData.has(nextPixelToFlip)) {
        currentFrameData.get(nextPixelToFlip)[1] = rgbAfter;
        currentFrameData.get(nextPixelToFlip)[2]++;  // Pixel type flip count. Odd means flipped, and even means not flipped.
    } else {
        const flipRgbStart = nextPixelToFlip * 4;
        const rgbBefore = imageDataCalc.slice(flipRgbStart, flipRgbStart + 3);
        currentFrameData.set(nextPixelToFlip, [rgbBefore, rgbAfter, 1]);
    };

    for (const rgba of [0, 1, 2]) {
        imageDataCalc[nextPixelToFlip * 4 + rgba] = rgbAfter[rgba];
    };

    // End block.
    //
    // Check if the topology of neighbor pixels has changed, and update if so.

    for (let pixelIndex = 0; pixelIndex < 8; pixelIndex++) {

        const checkPixel = adjacentNeighborsOfFlipped[pixelIndex];

        if (checkPixel === null) continue;

        const checkPixelCoords = surroundingCoords[pixelIndex];  // Center pixel at index 8 is ignored.
        const checkPixelNeighbors = pixelArrayFromGridRotationOrder(vicinityOfNextToFlip, checkPixelCoords);
        const checkPixelFixed = pixelFixed(checkPixel, checkPixelNeighbors);
        const oldGroupOfCheckPixel = groupArrayByPixelNum.get(checkPixel);
        const oldGroupOfCheckPixelStr = groupArrayToStr(oldGroupOfCheckPixel);

        let newGroupOfCheckPixel;
        if (checkPixelFixed) {
            // Side neighbors not needed for recalcGroup().
            newGroupOfCheckPixel = recalcGroup(checkPixel, checkPixelFixed);
        } else {
            const checkPixelSideNeighbors = extractSideNeighbors(checkPixelNeighbors);
            newGroupOfCheckPixel = recalcGroup(checkPixel, checkPixelFixed, checkPixelSideNeighbors);
        };

        const newGroupOfCheckPixelStr = groupArrayToStr(newGroupOfCheckPixel);

        let queueType;
        if (pixelsBinaryCalc[checkPixel] === 1) queueType = 'removeQueue';
        else queueType = 'addQueue';

        changeQueue(checkPixel, oldGroupOfCheckPixelStr, newGroupOfCheckPixelStr, queueType, queueType, checkPixelFixed);
        groupArrayByPixelNum.set(checkPixel, newGroupOfCheckPixel);
    };

    return nextPixelToFlip;
};


// STATISTICAL

function sortAscendCompareFunc(a, b) { return a - b; };
function sortDescendCompareFunc(a, b) { return b - a; };

function arithMean(array) {
    let sum = 0;
    for (const value of array) {
        sum += value;
    };
    return sum / array.length;
};

function weightedCircularMeanDegrees(angles, radii) {
    // Each angle in angles array should be in degrees: 0 <= angle < 360.

    let sumX = 0;
    let sumY = 0;

    let index = 0;
    for (const degreeValue of angles) {
        const radians = degreeValue * 2 * Math.PI / 360;
        const radius = radii[index];
        sumX += Math.cos(radians) * radius;
        sumY += Math.sin(radians) * radius;
        index++;
    };

    let avgRadians = Math.atan(sumY / sumX);  // Divide by zero ok here; as X approaches infinity, atan(X) approaches pi/2.
    if (sumX < 0) {
        // Quadrant II or III
        avgRadians += Math.PI;
    } else if (sumY < 0) {
        // Quadrant IV
        avgRadians += 2 * Math.PI;
    };

    const avgDegrees = avgRadians * 360 / 2 / Math.PI;
    const avgRadius = Math.sqrt(sumX * sumX + sumY * sumY) / angles.length;
    return [avgDegrees, avgRadius];
};

function findPartitionThreshold(array, granularity, unsorted=true) {
    // Finds the threshold value at which to partition the array into two clusters
    // so that the sum of the distance squared of each value to its partition's centroid is minimized.
    // Returned is the lowest possible value of the upper partition.
    // If the input array is already sorted ascending, set unsorted to false.
    // Granularity is an integer 2 or greater, and determines how many divisions of the data to try.
    // A granularity of 2 will choose from partitioning the data at the 33% or 67% points. A granularity of 1 is trivial.
    // All odd numbered granularities will try at the 50% point, and all evens will not.

    if (unsorted) array.sort(sortAscendCompareFunc);

    const lowest = array[0];
    const highest = array[array.length - 1];
    const step = (highest - lowest) / (granularity + 1);
    let partitionValue = lowest;
    let lastPartitionIndex = 0;
    let centroidA = 0;
    let centroidB = arithMean(array);
    let bestDistSqSum = Infinity;
    let bestPartitionValue = Infinity;

    for (let partitionNum = 0; partitionNum < granularity; partitionNum++) {  // Loop same number of times as granularity value.

        partitionValue += step;  // The lowest possible value of the upper partition.

        let centroidChangeSum = 0;
        let partitionIndex = array.length;  // Lowest index of second partition, initialized to last index.
        for (let index = lastPartitionIndex; index < array.length; index++) {
            const value = array[index];
            if (value < partitionValue) {
                centroidChangeSum += value;
            } else {
                partitionIndex = index;
                break;
            };
        };

        if (partitionIndex === lastPartitionIndex) {
            continue;
        };

        // Update centroids.
        if (partitionIndex > 0) {  // Condition prevents divide by zero error.
            centroidA = (centroidA * lastPartitionIndex + centroidChangeSum) / partitionIndex;
        };
        if (partitionIndex < array.length) {
            centroidB = (centroidB * (array.length - lastPartitionIndex) - centroidChangeSum) / (array.length - partitionIndex);
        };

        let distSqSum = 0;
        for (let index = 0; index < array.length; index++) {
            const value = array[index];
            if (index < partitionIndex) {
                distSqSum += Math.pow(value - centroidA, 2);
            } else {
                distSqSum += Math.pow(value - centroidB, 2);
            };
        };

        if (distSqSum < bestDistSqSum) {
            bestDistSqSum = distSqSum;
            bestPartitionValue = (centroidA + centroidB) / 2;
        };

        lastPartitionIndex = partitionIndex;
    };

    return bestPartitionValue;
};


// PIXEL COLOR ANALYSIS

function getPixelLightness(pixelNum) {
    // 0 <= lightness < 256
    // Lightness is average between the highest and lowest value in rgb color space.
    const rgb = imageDataFirstFrame.slice(pixelNum * 4, pixelNum * 4 + 3);
    const maxRgb = Math.max(rgb[0], rgb[1], rgb[2]);
    const minRgb = Math.min(rgb[0], rgb[1], rgb[2]);
    const lightness = (maxRgb + minRgb) / 2;
    return lightness;
};

function onPixel(pixelNum) {
    const lightness = getPixelLightness(pixelNum);
    if (lightness > lightnessThreshold) {
        return false;
    };
    return true;
};

function hslToRgb(hsl) {

    let r, g, b;
    let h = hsl[0] / 360;
    let s = hsl[1] / 100;
    let l = hsl[2] / 100;

    if (s == 0) {
        r = g = b = l;

    } else {

        function hue2rgb(p, q, t) {

            if (t < 0) t += 1;
            else if (t > 1) t -= 1;

            if (t < 1 / 6) return p + (q - p) * 6 * t;
            if (t < 1 / 2) return q;
            if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
            return p;
        };

        let q = l < 0.5 ? l * (1 + s) : l + s - l * s;
        let p = 2 * l - q;
        r = hue2rgb(p, q, h + 1 / 3);
        g = hue2rgb(p, q, h);
        b = hue2rgb(p, q, h - 1 / 3);
    };

    return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
};

function rgbToHsl(rgb) {

    let r = rgb[0] / 255;
    let g = rgb[1] / 255;
    let b = rgb[2] / 255;
    
    let max = Math.max(r, g, b);
    let min = Math.min(r, g, b);
    let h, s, l = (max + min) / 2;

    if (max === min){
        h = s = 0;

    } else {
        let d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        switch(max) {
            case r: h = (g - b) / d + (g < b ? 6 : 0); break;
            case g: h = (b - r) / d + 2; break;
            case b: h = (r - g) / d + 4;
        };
        h /= 6;
    };

    return [h * 360, s * 100, l * 100];
};


// IMAGE PROCESSING

function numPixelsToChange(groupPerimLength) {
    const numPixels = Math.floor(Math.pow(groupPerimLength / smallestPossPerim, 0.5));
    return numPixels;
};

function pixelCoordsToNum(pixelCoords) {
    // Pass in pixelCoords as an array [x, y].
    const pixelNum = pixelCoords[1] * imageWidth + pixelCoords[0];
    return pixelNum;
};

function pixelNumToCoords(pixelNum) {
    // Returns coordinates as an array [x, y].
    const x = pixelNum % imageWidth;
    const y = Math.floor(pixelNum / imageWidth);
    return [x, y];
};

function pixelDistance(pixelNumA, pixelNumB) {
    const aCoords = pixelNumToCoords(pixelNumA);
    const bCoords = pixelNumToCoords(pixelNumB);
    const xDiffSquared = Math.pow(aCoords[0] - bCoords[0], 2);
    const yDiffSquared = Math.pow(aCoords[1] - bCoords[1], 2);
    const dist = Math.sqrt(xDiffSquared + yDiffSquared);
    return dist;
};

function coordsInBounds(pixelCoords) {
    // Coords is an array [x, y].
    if (0 <= pixelCoords[0] && pixelCoords[0] < imageWidth) {
        if (0 <= pixelCoords[1] && pixelCoords[1] < imageHeight) {
            return true;
        };
    };
    return false;
};

function createGrid(centerPixelNum, radius) {
    // Returns gridObject with the following structure: [[row0Pixel0, row0Pixel1, ... ], [row1Pixel0, row1Pixel1, ... ], ... ].
    // Radius is half of the side length of the square grid. REQUIRED: 0 < radius
    // Result includes the center pixel itself.

    const centerCoords = pixelNumToCoords(centerPixelNum);

    const allRows = [];

    for (let y = centerCoords[1] - radius; y <= centerCoords[1] + radius; y++) {

        const row = [];

        if (0 <= y && y < imageHeight) {
            for (let x = centerCoords[0] - radius; x <= centerCoords[0] + radius; x++) {
                if (0 <= x && x < imageWidth) {
                    const pixelNum = pixelCoordsToNum([x, y]);
                    row.push(pixelNum);
                } else {
                    // This x out of bounds.
                    row.push(null);
                };
            };

        } else {

            // store null rows of specific radii lengths in memory so you don't have to make them every time !!!!! !@#$!@#$!@#$ //debugdebug

            // Entire row out of bounds.
            for (let i = 0; i < radius * 2 + 1; i++) {
                row.push(null);
            };
        };

        allRows.push(row);
    };

    return allRows;
};

function subGridFromGrid(gridObject, relSubCenterCoords, subRadius) {
    // Pass in gridObject created from createGridObject.
    // RelSubCenterCoords is of the form [x, y], and is relative to the center pixel at [0, 0].
    // REQUIRED: subradius + Math.abs(relSubCenterCoords[x or y]) <= gridCenterIndex

    const gridCenterIndex = gridObject.length / 2 - 0.5;  // This is also the index for the center pixel. Represents center index for both x and y.
    const subCenterCoords = [gridCenterIndex + relSubCenterCoords[0], gridCenterIndex + relSubCenterCoords[1]];
    const subGrid = [];
    for (let y = subCenterCoords[1] - subRadius; y <= subCenterCoords[1] + subRadius; y++) {
        const partialRow = gridObject[y].slice(subCenterCoords[0] - subRadius, subCenterCoords[0] + subRadius + 1);
        subGrid.push(partialRow);
    };
    return subGrid;
};

function pixelArrayFromGrid(gridObject, relCenterCoords, radius=1) {
    // Pass in gridObject created from createGridObject.
    // Radius can be 1 or 2.
    // Center pixel is excluded.
    // RelCenterCoords is of the form [x, y], and is relative to the grid's center pixel at [0, 0].
    // REQUIRED: radius + Math.abs(relCenterCoords[x or y]) <= gridCenterIndex

    const gridCenterIndex = gridObject.length / 2 - 0.5;  // This is also the index for the center pixel. Represents center index for both x and y.
    const subCenterCoords = [gridCenterIndex + relCenterCoords[0], gridCenterIndex + relCenterCoords[1]];
    const pixelArray = [];

    for (let y = subCenterCoords[1] - radius; y <= subCenterCoords[1] + radius; y++) {
        const partialRow = gridObject[y].slice(subCenterCoords[0] - radius, subCenterCoords[0] + radius + 1);
        pixelArray.push(...partialRow);
    };

    if (radius === 1) pixelArray.splice(4, 1);
    else pixelArray.splice(12, 1);  // Radius is 2.

    return pixelArray;
};

function pixelArrayFromGridRotationOrder(gridObject, relCenterCoords) {
    // Faster than reordering from pixelArrayFromGrid().
    // Returns the top-left neighbor first, then proceeds clockwise.
    // Pass in gridObject created from createGridObject.
    // Radius is 1.
    // Center pixel is excluded.
    // RelCenterCoords is of the form [x, y], and is relative to the grid's center pixel at [0, 0].
    // REQUIRED: 1 + Math.abs(relCenterCoords[x or y]) <= gridCenterIndex

    const gridCenterIndex = gridObject.length / 2 - 0.5;  // This is also the index for the center pixel. Represents center index for both x and y.
    const subCenterCoords = [gridCenterIndex + relCenterCoords[0], gridCenterIndex + relCenterCoords[1]];

    const xLeft = subCenterCoords[0] - 1;
    const xRight = subCenterCoords[0] + 1;
    const yBottom = subCenterCoords[1] + 1;

    const pixelArray = gridObject[subCenterCoords[1] - 1].slice(xLeft, xRight + 1);  // Top row.
    pixelArray.push(gridObject[subCenterCoords[1]][xRight]);  // Mid-right
    pixelArray.push(gridObject[yBottom][xRight]);  // Bottom-right
    pixelArray.push(gridObject[yBottom][xRight - 1]);  // Bottom-center
    pixelArray.push(gridObject[yBottom][xLeft]);  // Bottom-left
    pixelArray.push(gridObject[subCenterCoords[1]][xLeft]);  // Mid-left

    return pixelArray;
};

function getAllNeighbors(pixel, nullForOutOfBounds=false) {
    // Used in initGroupData(), calcNextFrameGroupIter(), and randPixel() in choosePixelToChange().
    // Returns the top-left neighbor first, then proceeds clockwise.

    // Determine if any neighbors are out of bounds.
    const topValid = pixel - imageWidth >= 0;
    const rightValid = (pixel + 1) % imageWidth !== 0;
    const bottomValid = pixel + imageWidth < imgPixelCount;
    const leftValid = pixel % imageWidth !== 0;

    const allNeighbors = [];

    if (nullForOutOfBounds) {

        if (topValid) {

            const top = pixel - imageWidth;

            // Top-left
            if (leftValid) allNeighbors.push(top - 1);
            else allNeighbors.push(null);

            allNeighbors.push(top);  // Top-center

            // Top-right and mid-right
            if (rightValid) {
                allNeighbors.push(top + 1);
                allNeighbors.push(pixel + 1);
            } else {
                allNeighbors.push(null, null);
            };

        } else {
            // Top not valid.

            allNeighbors.push(null, null, null);  // Top-left, top-center, and top-right

            // Mid-right
            if (rightValid) allNeighbors.push(pixel + 1);
            else allNeighbors.push(null);
        };

        if (bottomValid) {

            const bottom = pixel + imageWidth;

            // Bottom-right
            if (rightValid) allNeighbors.push(bottom + 1);
            else allNeighbors.push(null);

            allNeighbors.push(bottom);  // Bottom-center

            // Bottom-left and mid-left
            if (leftValid) {
                allNeighbors.push(bottom - 1);
                allNeighbors.push(pixel - 1);
            } else {
                allNeighbors.push(null, null);
            };

        } else {
            // Bottom not valid.

            allNeighbors.push(null, null, null);  // Bottom-right, bottom-center, and bottom-left

            // Mid-left
            if (leftValid) allNeighbors.push(pixel - 1);
            else allNeighbors.push(null);
        };

    } else {
        // Not null for out of bounds.

        if (topValid) {

            const top = pixel - imageWidth;

            if (leftValid) allNeighbors.push(top - 1);  // Top-left
            allNeighbors.push(top);  // Top-center

            // Top-right and mid-right
            if (rightValid) {
                allNeighbors.push(top + 1);
                allNeighbors.push(pixel + 1);
            };

        } else {
            // Top not valid.
            if (rightValid) allNeighbors.push(pixel + 1);  // Mid-right
        };

        if (bottomValid) {

            const bottom = pixel + imageWidth;

            if (rightValid) allNeighbors.push(bottom + 1);  // Bottom-right
            allNeighbors.push(bottom);  // Bottom-center

            // Bottom-left and mid-left
            if (leftValid) {
                allNeighbors.push(bottom - 1);
                allNeighbors.push(pixel - 1);
            };

        } else {
            // Bottom not valid.
            if (leftValid) allNeighbors.push(pixel - 1);  // Mid-left
        };
    };

    return allNeighbors;
};

function extractSideNeighbors(allNeighbors) {
    // Pass in allNeighbors retrieved from getAllNeighbors(), having set the nullForOutOfBounds argument to true.
    // Returns null for out of bounds.
    return [allNeighbors[1], allNeighbors[3], allNeighbors[5], allNeighbors[7]];
};

function getSideNeighbors(pixel) {
    // Returns the top neighbor first, then proceeds clockwise.
    // Ignores out of bounds pixels (no null).
    // Used only once in initGroupData().
    const allNeighbors = [];
    if (pixel - imageWidth >= 0) allNeighbors.push(pixel - imageWidth);  // Include top neighbor.
    if ((pixel + 1) % imageWidth !== 0) allNeighbors.push(pixel + 1);  // Include right neighbor.
    if (pixel + imageWidth < imgPixelCount) allNeighbors.push(pixel + imageWidth);  // Include bottom neighbor.
    if (pixel % imageWidth !== 0) allNeighbors.push(pixel - 1);  // Include left neighbor.
    return allNeighbors;
};

function countOnPixels(pixelArray) {
    let onPixelCount = 0;
    for (const pixel of pixelArray) {
        if (pixel === null) continue;
        if (pixelsBinaryCalc[pixel] === 1) onPixelCount++;
    };
    return onPixelCount;
};

function groupStrToArray(string) {
    // If on group is 3 and off group is -4, then array is of the form [3, -4], and string is of the form '3,-4'.
    const stringArray = string.split(',');
    return [Number(stringArray[0]), Number(stringArray[1])];
};

function groupArrayToStr(array) {
    // If on group is 3 and off group is -4, then array is of the form [3, -4], and string is of the form '3,-4'.
    const combinedString = String(array[0]) + ',' + String(array[1]);
    return combinedString;
};

function calcAdjacentGroups(pixelNum, sideNeighbors) {
    // Returns an array of group ids. Group ids are of the form returned from groupStrToArray().

    const hypoGroups = [];
    const simpGroupsAdded = new Set();

    if (pixelsBinaryCalc[pixelNum] === 1) {
        // Root pixel is on.

        const onGroup = groupArrayByPixelNum.get(pixelNum)[0];

        for (const neighbor of sideNeighbors) {
            if (neighbor === null) continue;
            if (pixelsBinaryCalc[neighbor] === 0) {
                // Neighbor is off.
                const offGroup = groupArrayByPixelNum.get(neighbor)[1];
                if (simpGroupsAdded.has(offGroup)) continue;
                simpGroupsAdded.add(offGroup);
                const hypoGroupArray = [onGroup, offGroup];
                hypoGroups.push(hypoGroupArray);
            };
        };

        return hypoGroups;

    } else {
        // Root pixel is off.

        const offGroup = groupArrayByPixelNum.get(pixelNum)[1];

        for (const neighbor of sideNeighbors) {
            if (neighbor === null) continue;
            if (pixelsBinaryCalc[neighbor] === 1) {
                // Neighbor is on.
                const onGroup = groupArrayByPixelNum.get(neighbor)[0];
                if (simpGroupsAdded.has(onGroup)) continue;
                simpGroupsAdded.add(onGroup);
                const hypoGroupArray = [onGroup, offGroup];
                hypoGroups.push(hypoGroupArray);
            };
        };

        return hypoGroups;
    };
};

function recalcGroup(pixelNum, pixelFixed, sideNeighbors) {
    // PixelFixed is a boolean calculated via pixelFixed(pixelNum).
    // If pixelFixed is true, sideNeighbors is not needed.

    if (pixelsBinaryCalc[pixelNum] === 1) {
        // Root pixel is on.
        const onGroup = groupArrayByPixelNum.get(pixelNum)[0];
        if (pixelFixed) return [onGroup, 0];  // Secondary group is 0 for fixed pixels.
        for (const neighbor of sideNeighbors) {
            if (neighbor === null) continue;  // Neighbor is out of bounds.
            if (pixelsBinaryCalc[neighbor] === 0) {
                // Neighbor is off.
                const offGroup = groupArrayByPixelNum.get(neighbor)[1];
                return [onGroup, offGroup];
            };
        };
        return [onGroup, 0];  // If not touching edge or an OFF-pixel (no return statement reached), OFF-group is 0.

    } else {
        // Root pixel is off.
        const offGroup = groupArrayByPixelNum.get(pixelNum)[1];
        if (pixelFixed) return [0, offGroup];  // Secondary group is 0 for fixed pixels.
        for (const neighbor of sideNeighbors) {
            if (neighbor === null) continue;
            if (pixelsBinaryCalc[neighbor] === 1) {
                // Neighbor is on.
                const onGroup = groupArrayByPixelNum.get(neighbor)[0];
                return [onGroup, offGroup];
            };
        };
        return [0, offGroup];  // If not touching an ON-pixel (no return statement reached), ON-group is 0.
    };
};

function changeQueue(pixelNum, startGroupId, endGroupId, startType, endType, justDelete=false) {
    // Valid "group id" arguments are strings of the type created by groupArrayToStr().
    // Valid "type" arguments are the strings 'addQueue' or 'removeQueue'.
    // JustDelete is a boolean. When true, the pixel is not added to the end queue. Set as true when pixel is fixed.

    if (groupData.has(startGroupId)) {
        const startQueue = groupData.get(startGroupId).get(startType);
        if (startQueue.has(pixelNum)) {
            startQueue.delete(pixelNum);
        };
    };

    if (justDelete === false) {
        const endQueue = groupData.get(endGroupId).get(endType);
        endQueue.add(pixelNum);
    };
};

function pixelFixed(pixelNum, allNeighbors) {
    // Tests whether or not a pixel can be flipped on and off without changing the 'topology' of the image.
    // Pass in allNeighbors retrieved using getAllNeighbors() with nullForOutOfBounds=true.

    let touchNumber = 0;  // Counts number of connected ON-pixel groups while circling neighbors surrounding pixel.
    let sideOnPixelCount = 0;  // Counts total number of side ON-pixels.
    const beforeAfterOOB = [true, false];  // Stores a boolean for whether the pixel before (index 0 of array) and after (index 1 of array) an out of bounds region is an ON-pixel.
        // Initialized so that if no out of bounds region is encountered, this is ignored/passed.

    const midLeftPixelNum = allNeighbors[7];
    let lastPixelOn;
    if (midLeftPixelNum === null) return true;  // Null if out of bounds which means pixel is fixed, otherwise lastPixelOn is a boolean.
    else lastPixelOn = pixelsBinaryCalc[midLeftPixelNum] === 1;

    for (let neighborIndex = 0; neighborIndex < 8; neighborIndex++) {

        const pixelNum = allNeighbors[neighborIndex];

        if (pixelNum === null) return true;

        const thisPixelOn = pixelsBinaryCalc[pixelNum] === 1;

        if (thisPixelOn) {
            if (neighborIndex % 2 === 1) sideOnPixelCount++;
            if (lastPixelOn !== true) {  // Not true could be false or null.
                if (touchNumber > 0) return true;  // Touching multiple disconnected groups.
                touchNumber++;
            };
        };
        
        lastPixelOn = thisPixelOn;
    };

    if (touchNumber !== 1 || sideOnPixelCount < 1 || 3 < sideOnPixelCount) return true;
    if (beforeAfterOOB[0] === beforeAfterOOB[1]) return true;  // Pixel is fixed if both pixels bordering an out of bounds region are the same type.
    return false;  // If not returned true in previous tests, return false.
};

function weightsFromNeighborCounts(neighborCounts, weightBase, addOrRemove) {
    // Returns array of weights corresponding to neighborCounts.
    // Weighting is based on the relative ranking of values in neighborCounts, rather than on their actual values.
    // WeightBase is the ratio between each successive rank.
    // AddOrRemove is a string: either 'add' or 'remove'.

    const sortedArray = neighborCounts.slice();
    if (addOrRemove === 'add') {
        sortedArray.sort(sortAscendCompareFunc);
    } else {
        sortedArray.sort(sortDescendCompareFunc);
    };

    const weightsByValue = {};
    let prevValue = -1;  // NeighborCounts never contain a negative value.
    let currentWeight = 1;
    for (const currentValue of sortedArray) {
        if (currentValue === prevValue) { continue; };
        weightsByValue[currentValue] = currentWeight;
        prevValue = currentValue;
        currentWeight *= weightBase;  // Skipped if currentValue === prevValue.
    };

    const weights = [];
    for (const currentValue of neighborCounts) {
        const weight = weightsByValue[currentValue];
        weights.push(weight);
    };

    return weights;
};

function choosePixelToChange(nearbyPixel, nearbyGrid, addOrRemove, group) {
    // Returns the array [pixelNum, recalcNearbyGrid]. PixelNum is null if no pixel is available.
        // If recalcNearbyGrid is an array [x, y], it indicates the coordinates of pixelNum within nearbyGrid, which can be used to generate a relevant new grid from nearbyGrid.
        // If recalcNearbyGrid is true, it indicates that pixelNum was selected randomly and could be off of nearbyGrid, therefore a new grid should be recalculated from scratch.
        // If recalcNearbyGrid is false, no pixelNum was found (returned null) and no further grid will be needed.
    // If nearbyPixel is null or no possibilities exist adjacent to nearbyPixel, a random pixel is chosen. Always chooses maximum decrease in border length from random sample.
    // If no pixel is available, null is returned for pixelNum.
    // AddOrRemove is a string, either 'add' or 'remove'.
    // Group is a string like the form created from groupArrayToStr().

    let queueName;
    if (addOrRemove === 'add') queueName = 'addQueue';
    else queueName = 'removeQueue';

    const groupMap = groupData.get(group);
    const queueMap = groupMap.get(queueName);

    if (nearbyPixel === null) return randPixel();

    const primaryGroup = groupStrToArray(group)[0];
    const possPixelIndices = [];
    const possPixelNeighborCounts = [];
    const pixelPool = pixelArrayFromGrid(nearbyGrid, [0, 0]);
    pixelPool.push(nearbyPixel);  // Include nearbyPixel itself at end of pixelPool.

    for (let pixelIndex = 0; pixelIndex < 9; pixelIndex++) {
        const pixelNum = pixelPool[pixelIndex];
        if (pixelNum === null) continue;
        if (queueMap.has(pixelNum)) {
            const areaNeighbors = pixelArrayFromGrid(nearbyGrid, surroundingCoords[pixelIndex]);
            let neighborsInGroupCount = 0;
            for (const neighbor of areaNeighbors) {
                if (neighbor === null) continue;
                if (groupArrayByPixelNum.get(neighbor)[0] === primaryGroup) neighborsInGroupCount++;  // Always counts within ON-pixel group.
            };
            possPixelIndices.push(pixelIndex);
            possPixelNeighborCounts.push(neighborsInGroupCount);
        };
    };
    
    if (possPixelIndices.length === 0) return randPixel();

    const weightBase = groupMap.get('dynamicWeightBase');
    const weights = weightsFromNeighborCounts(possPixelNeighborCounts, weightBase, addOrRemove);
    const weightIndex = weightedRandChoice(weights);
    const pixelPoolIndex = possPixelIndices[weightIndex];
    const pixelToFlip = pixelPool[pixelPoolIndex];
    const gridRelCoords = surroundingCoords[pixelPoolIndex];
    return [pixelToFlip, gridRelCoords];

    function randPixel() {
        // Always chooses maximum decrease in border length from random sample.

        if (queueMap.size === 0) return [null, false];

        const allPixelsInQueue = Array.from(queueMap);
        let bestPixel = null;
        let bestRank = -1;

        for (let i = 0; i < randPixelSampleCount; i++) {

            let randPixel = randChoice(allPixelsInQueue);
            const randNeighbors = getAllNeighbors(randPixel);

            let rank;
            if (addOrRemove === 'add') rank = countOnPixels(randNeighbors);
            else rank = 8 - countOnPixels(randNeighbors);

            if (rank === 7) {
                return [randPixel, true];
            } else if (rank > bestRank) {
                bestPixel = randPixel;
                bestRank = rank;
            };
        };

        return [bestPixel, true];
    };
};


// ARRAY MANIPULATION

function shuffleArray(array) {
    // Returns nothing, and alters the original array. To create a new shuffled version of the original array:
    // let arrayCopy = array.slice();
    // shuffleArray(arrayCopy);

    for (let iIndex = array.length - 1; iIndex > 0; iIndex--) {
        let jIndex = Math.floor(Math.random() * (iIndex + 1));
        let iValue = array[iIndex];
        array[iIndex] = array[jIndex];
        array[jIndex] = iValue;
    };
};

function randChoice(array) {
    if (array.length === 0) return null;
    const index = Math.floor(Math.random() * array.length);
    return array[index];
};

function weightedRandChoice(weightsArray, weightSum=null) {
    // If weightSum is null, weightSum is calculated by looping through weightsArray.
    // If weights are ordered from greatest to least, the algorithm is faster.
    // Returns index that is chosen corresponding to weightArray.
    // Returns null if weightSum is 0 or no weight given in weightsArray.

    if (weightSum === null) {
        weightSum = 0;
        for (const weight of weightsArray) {
            weightSum += weight;
        };
    };

    if (weightSum <= 0) return null;

    const randomFloat = Math.random();

    let aggregatedWeight = 0;
    for (let index = 0; index < weightsArray.length; index++) {
        aggregatedWeight += weightsArray[index] / weightSum;
        if (randomFloat < aggregatedWeight) {
            return index;
        };
    };

    return null;  // May reach this return if no weight in weightsArray was given a valid positive weight.
};
