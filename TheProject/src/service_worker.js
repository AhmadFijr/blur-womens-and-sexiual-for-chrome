
import * as tf from '@tensorflow/tfjs';

let model;

const options = { // options
  modelPath: '../models/default-f16/model.json',
  minScore: 0.38,
  maxResults: 50,
  iouThreshold: 0.5,
  outputNodes: ['output1', 'output2', 'output3'],
  blurRadius: 25,
  resolution: [1280, 720],
};

const labels = [ // class labels
  'exposed anus',
  'exposed armpits',
  'belly',
  'exposed belly',
  'buttocks',
  'exposed buttocks',
  'female face',
  'male face',
  'feet',
  'exposed feet',
  'breast',
  'exposed breast',
  'vagina',
  'exposed vagina',
  'male breast',
  'exposed male breast',
];

const composite = { // composite definitions of what is a person, sexy, nude
  person: [6, 7],
  sexy: [1, 2, 3, 4, 8, 9, 10, 15],
  nude: [0, 5, 11, 12, 13],
};

const loadModel = async () => {
  console.log('Loading model...');
  await tf.setBackend('webgl');
  model = await tf.loadGraphModel(options.modelPath);
  console.log('Model loaded.');
};

loadModel();

async function processPrediction(boxesTensor, scoresTensor, classesTensor, inputTensor) {
  const boxes = await boxesTensor.array();
  const scores = await scoresTensor.data();
  const classes = await classesTensor.data();
  const nmsT = await tf.image.nonMaxSuppressionAsync(boxes[0], scores, options.maxResults, options.iouThreshold, options.minScore); // sort & filter results
  const nms = await nmsT.data();
  tf.dispose(nmsT);
  const parts = [];
  for (const i in nms) { // create body parts object
    const id = parseInt(i);
    parts.push({
      score: scores[i],
      id: classes[id],
      class: labels[classes[id]], // lookup classes
      box: [ // convert box from x0,y0,x1,y1 to x,y,width,heigh
        Math.trunc(boxes[0][id][0]),
        Math.trunc(boxes[0][id][1]),
        Math.trunc((boxes[0][id][3] - boxes[0][id][1])),
        Math.trunc((boxes[0][id][2] - boxes[0][id][0])),
      ],
    });
  }
  const result = {
    input: { width: inputTensor.shape[2], height: inputTensor.shape[1] },
    person: parts.filter((a) => composite.person.includes(a.id)).length > 0,
    sexy: parts.filter((a) => composite.sexy.includes(a.id)).length > 0,
    nude: parts.filter((a) => composite.nude.includes(a.id)).length > 0,
    parts,
  };
  return result;
}

const classify = async (imageData) => {
  const {width, height, data} = imageData;
  const image = tf.tensor3d(data, [height, width, 4]).slice([0, 0, 0], [height, width, 3]);
  const t = {};
  t.resize = (options.resolution[0] > 0 && options.resolution[1] > 0 && (options.resolution[0] !== width || options.resolution[1] !== height)) // do we need to resize
    ? tf.image.resizeNearestNeighbor(image, [options.resolution[1], options.resolution[0]])
    : image;
  t.cast = tf.cast(t.resize, 'float32');
  t.batch = tf.expandDims(t.cast, 0);
  const [boxes, scores, classes] = await model.executeAsync(t.batch, options.outputNodes);
  const predictions = await processPrediction(boxes, scores, classes, t.cast);
  image.dispose();
  Object.keys(t).forEach((tensor) => tf.dispose(t[tensor]));
  tf.dispose(boxes);
  tf.dispose(scores);
  tf.dispose(classes);
  return predictions;
};

chrome.contextMenus.create({
  id: 'classify-image',
  title: 'Classify image with TensorFlow.js',
  contexts: ['image'],
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === 'classify-image') {
    chrome.tabs.sendMessage(tab.id, {action: 'IMAGE_CLICKED', url: info.srcUrl}, async (response) => {
      if (response && response.rawImageData) {
        const predictions = await classify(response);
        chrome.tabs.sendMessage(tab.id, {action: 'IMAGE_CLICK_PROCESSED', url: info.srcUrl, predictions});
      }
    });
  }
});
