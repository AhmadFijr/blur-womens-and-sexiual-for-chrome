/**
 * @license
 * Copyright 2019 Google LLC. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 * =============================================================================
 */

// class name for all text nodes added by this script.
const BLUR_CONTAINER_CLASSNAME = 'bluer_container';

// Size of the image expected by mobilenet.
const IMAGE_SIZE = 224;

// The minimum image size to consider classifying.  Below this limit the
// extension will refuse to classify the image.
const MIN_IMG_SIZE = 128;

// Add a listener to hear from the content.js page when the image is through
// processing.  The message should contin an action, a url, and predictions (the
// output of the classifier)
//
// message: {action, url, predictions}
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message) {
    return;
  }

  switch (message.action) {
    case 'IMAGE_CLICKED':
      loadImageAndSendDataBack(message.url, sendResponse);
      // This is needed to make sendResponse work properly.
      return true;
    case 'IMAGE_CLICK_PROCESSED':
      if (message.url && message.predictions) {
        // Get the list of images with this srcUrl.
        const imgElements = getImageElementsWithSrcUrl(message.url);
        for (const imgNode of imgElements) {
          processParts(imgNode, message.predictions);
        }
      }
      break;
    default:
      break;
  }
});

const composite = { // composite definitions of what is a person, sexy, nude
  person: [6, 7],
  sexy: [1, 2, 3, 4, 8, 9, 10, 15],
  nude: [0, 5, 11, 12, 13],
};

function processParts(imgNode, res) {
  for (const obj of res.parts) { // draw all detected objects
    if (composite.nude.includes(obj.id)) blur(imgNode, obj.box);
    if (composite.sexy.includes(obj.id)) blur(imgNode, obj.box);
  }
}

function blur(imgNode, box) {
  const [x, y, width, height] = box;
  const canvas = document.createElement('canvas');
  canvas.width = imgNode.width;
  canvas.height = imgNode.height;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(imgNode, 0, 0);
  const blurCanvas = document.createElement('canvas');
  blurCanvas.width = width;
  blurCanvas.height = height;
  const blurCtx = blurCanvas.getContext('2d');
  blurCtx.imageSmoothingEnabled = true;
  blurCtx.drawImage(canvas, x, y, width, height, 0, 0, width / 25, height / 25);
  ctx.drawImage(blurCanvas, x, y, width, height);

  const container = document.createElement('div');
  container.style.position = 'relative';
  container.className = BLUR_CONTAINER_CLASSNAME;

  const newCanvas = document.createElement('canvas');
  newCanvas.width = imgNode.width;
  newCanvas.height = imgNode.height;
  const newCtx = newCanvas.getContext('2d');
  newCtx.drawImage(imgNode, 0, 0);
  newCtx.drawImage(blurCanvas, x, y, width, height);

  newCanvas.style.position = 'absolute';
  newCanvas.style.top = '0';
  newCanvas.style.left = '0';

  const originalParent = imgNode.parentElement;
  originalParent.insertBefore(container, imgNode);
  container.appendChild(imgNode);
  container.appendChild(newCanvas);
}


// Set up a listener to remove all annotations if the user clicks
// the left mouse button.  Otherwise, they can easily cloud up the
// window.
window.addEventListener('click', clickHandler, false);
/**
 * Removes text elements from DOM on a left click.
 */
function clickHandler(mouseEvent) {
  if (mouseEvent.button == 0) {
    const containers = document.getElementsByClassName(BLUR_CONTAINER_CLASSNAME);
    // Loop backwards as we are removing elements from the live HTMLCollection.
    for (let i = containers.length - 1; i >= 0; i--) {
      const container = containers[i];
      const originalImage = container.getElementsByTagName('img')[0];
      container.parentElement.insertBefore(originalImage, container);
      container.remove();
    }
  }
}

function loadImageAndSendDataBack(src, sendResponse) {
  // Load image (with crossOrigin set to anonymous so that it can be used in a
  // canvas later).
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.onerror = function(e) {
    console.warn(`Could not load image from external source ${src}.`);
    sendResponse({rawImageData: undefined});
    return;
  };
  img.onload = function(e) {
    if ((img.height && img.height > MIN_IMG_SIZE) ||
        (img.width && img.width > MIN_IMG_SIZE)) {
      img.width = IMAGE_SIZE;
      img.height = IMAGE_SIZE;
      // When image is loaded, render it to a canvas and send its ImageData back
      // to the service worker.
      const canvas = new OffscreenCanvas(img.width, img.height);
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);
      const imageData = ctx.getImageData(0, 0, img.width, img.height);
      sendResponse({
        rawImageData: Array.from(imageData.data),
        width: img.width,
        height: img.height,
      });
      return;
    }
    // Fail out if either dimension is less than MIN_IMG_SIZE.
    console.warn(`Image size too small. [${img.height} x ${
        img.width}] vs. minimum [${MIN_IMG_SIZE} x ${MIN_IMG_SIZE}]`);
    sendResponse({rawImageData: undefined});
  };
  img.src = src;
}
