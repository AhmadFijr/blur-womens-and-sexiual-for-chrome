const image = document.getElementById('image');
const canvas = document.getElementById('canvas');
const upload = document.getElementById('upload');
const logDiv = document.getElementById('log');

let model;

const options = {
  modelPath: '../../models/nudenet/model.json',
  minScore: 0.38,
  maxResults: 50,
  iouThreshold: 0.5,
};

const labels = [
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

function log(msg) {
  console.log(msg);
  logDiv.innerText += JSON.stringify(msg, null, 2) + '\n';
}

async function loadModel() {
  log('Loading model...');
  await tf.setBackend('webgl');
  await tf.ready();
  model = await tf.loadGraphModel(options.modelPath);
  log('Model loaded.');
  log({ tf: tf.version_core, backend: tf.getBackend() });
  upload.disabled = false;
}

function rect({ x = 0, y = 0, width = 0, height = 0, lineWidth = 2, color = 'red', title = '' }) {
  const ctx = canvas.getContext('2d');
  ctx.lineWidth = lineWidth;
  ctx.beginPath();
  ctx.rect(x, y, width, height);
  ctx.strokeStyle = color;
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.font = '16px sans-serif';
  ctx.fillText(title, x, y > 10 ? y - 5 : 15);
}

async function processImage() {
  log('Processing image...');
  const t0 = Date.now();

  const tensor = tf.browser.fromPixels(image);
  const cast = tf.cast(tensor, 'float32');
  const batch = tf.expandDims(cast, 0);
  
  const [boxes, scores, classes] = await model.executeAsync(batch);

  const nmsT = await tf.image.nonMaxSuppressionAsync(boxes.squeeze(), scores.squeeze(), options.maxResults, options.iouThreshold, options.minScore);
  const nms = await nmsT.data();
  tf.dispose([tensor, cast, batch, boxes, scores, classes, nmsT]);

  const parts = [];
  for (let i = 0; i < nms.length; i++) {
    const id = nms[i];
    const score = (await scores.squeeze().slice(id, 1).data())[0];
    const classId = (await classes.squeeze().slice(id, 1).data())[0];
    const box = await boxes.squeeze().slice(id, 1).squeeze().data();

    parts.push({
      score: score,
      class: labels[classId],
      box: [
        box[0] * image.width,
        box[1] * image.height,
        (box[2] - box[0]) * image.width,
        (box[3] - box[1]) * image.height,
      ],
    });
  }

  const t1 = Date.now();
  log(`Processing time: ${t1 - t0} ms`);
  log({ parts });

  // Draw image and boxes
  canvas.width = image.width;
  canvas.height = image.height;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(image, 0, 0);
  for (const part of parts) {
    rect({
      x: part.box[1], 
      y: part.box[0], 
      width: part.box[3] - part.box[1], 
      height: part.box[2] - part.box[0],
      title: `${Math.round(100 * part.score)}% ${part.class}`
    });
  }
}


upload.addEventListener('change', (event) => {
  const file = event.target.files[0];
  if (file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      image.src = e.target.result;
      image.style.display = 'block';
      image.onload = () => processImage();
    };
    reader.readAsDataURL(file);
  }
});

window.onload = () => {
  upload.disabled = true;
  loadModel();
};
