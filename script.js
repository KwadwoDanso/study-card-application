// Flashcard Study App — create, edit, delete, flip, navigate, adjust speed.
// This version uses three.js to render a smooth 3D flipping card and draw
// front/back text onto canvas textures for a more polished study experience.

// State
let cards = JSON.parse(localStorage.getItem("study-cards") || "[]");
let currentIndex = 0;
let isFlipped = false;
let editingId = null;
let isAnimating = false;
let flipStart = 0;
let flipDuration = 600;
let startRotation = 0;
let targetRotation = 0;

// DOM elements
const $ = (id) => document.getElementById(id);
const cardViewer = $("card-viewer");
const cardCanvas = $("card-canvas");
const counter = $("card-counter");
const emptyMsg = $("empty-msg");
const cardForm = $("card-form");
const frontInput = $("front-input");
const backInput = $("back-input");
const cardBtns = $("card-buttons");
const editBtns = $("edit-buttons");
const speedSlider = $("speed-slider");
const speedLabel = $("speed-value");
const modalOverlay = $("modal-overlay");

// three.js objects
let scene, camera, renderer, cardMesh, frontTexture, backTexture;
const CANVAS_WIDTH = 680;
const CANVAS_HEIGHT = 440;

// Helpers
const save = () => localStorage.setItem("study-cards", JSON.stringify(cards));
const show = (el) => el.classList.remove("hidden");
const hide = (el) => el.classList.add("hidden");

/**
 * Create a texture from a small HTML canvas with title and text.
 */
function createTextTexture(text, title, background, color) {
    const canvas = document.createElement("canvas");
    canvas.width = CANVAS_WIDTH;
    canvas.height = CANVAS_HEIGHT;
    const ctx = canvas.getContext("2d");

    ctx.fillStyle = background;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = color;
    ctx.font = "700 48px Inter, system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(title.toUpperCase(), canvas.width / 2, 80);

    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(80, 100);
    ctx.lineTo(canvas.width - 80, 100);
    ctx.stroke();

    ctx.fillStyle = color;
    ctx.font = "600 34px Inter, system-ui, sans-serif";
    wrapText(ctx, text, canvas.width / 2, 160, canvas.width - 120, 44);

    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    return texture;
}

function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
    const paragraphs = text.split("\n");
    let offsetY = 0;

    paragraphs.forEach((paragraph) => {
        const words = paragraph.split(" ");
        let line = "";

        for (let n = 0; n < words.length; n += 1) {
            const testLine = line ? `${line} ${words[n]}` : words[n];
            const metrics = ctx.measureText(testLine);
            if (metrics.width > maxWidth && line) {
                ctx.fillText(line, x, y + offsetY);
                line = words[n];
                offsetY += lineHeight;
            } else {
                line = testLine;
            }
        }

        if (line) {
            ctx.fillText(line, x, y + offsetY);
            offsetY += lineHeight;
        }

        offsetY += 12;
    });
}

function initThree() {
    scene = new THREE.Scene();

    camera = new THREE.PerspectiveCamera(35, CANVAS_WIDTH / CANVAS_HEIGHT, 0.1, 1000);
    camera.position.set(0, 0, 6);

    renderer = new THREE.WebGLRenderer({
        canvas: cardCanvas,
        alpha: true,
        antialias: true,
    });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(CANVAS_WIDTH, CANVAS_HEIGHT, false);

    const ambientLight = new THREE.AmbientLight(0xffffff, 1.0);
    scene.add(ambientLight);

    const geometry = new THREE.PlaneGeometry(3.4, 2.2);
    frontTexture = createTextTexture("Add a question to see the card.", "Question", "#7EE8FB", "#10264F");
    backTexture = createTextTexture("Add an answer to reveal it.", "Answer", "#ffffff", "#22242a");

    const frontMaterial = new THREE.MeshBasicMaterial({ map: frontTexture });
    const backMaterial = new THREE.MeshBasicMaterial({ map: backTexture });

    const frontPlane = new THREE.Mesh(geometry, frontMaterial);
    const backPlane = new THREE.Mesh(geometry, backMaterial);
    backPlane.rotation.y = Math.PI;

    cardMesh = new THREE.Group();
    cardMesh.add(frontPlane, backPlane);
    scene.add(cardMesh);
}

function updateCardTextures() {
    if (!cards.length || !cardMesh) return;

    if (frontTexture) frontTexture.dispose();
    if (backTexture) backTexture.dispose();

    frontTexture = createTextTexture(cards[currentIndex].front, "Question", "#7EE8FB", "#10264F");
    backTexture = createTextTexture(cards[currentIndex].back, "Answer", "#ffffff", "#22242A");

    cardMesh.children[0].material.map = frontTexture;
    cardMesh.children[1].material.map = backTexture;
    cardMesh.children[0].material.needsUpdate = true;
    cardMesh.children[1].material.needsUpdate = true;
}

function easeInOutCubic(t) {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function startFlipAnimation() {
    startRotation = cardMesh.rotation.y;
    targetRotation = isFlipped ? Math.PI : 0;
    flipStart = performance.now();
    flipDuration = (speedSlider.value / 10) * 1000;
    isAnimating = true;
}

function animate(time) {
    requestAnimationFrame(animate);

    if (isAnimating) {
        const elapsed = Math.min(1, (time - flipStart) / flipDuration);
        const eased = easeInOutCubic(elapsed);
        cardMesh.rotation.y = startRotation + (targetRotation - startRotation) * eased;

        if (elapsed >= 1) {
            isAnimating = false;
            cardMesh.rotation.y = targetRotation;
        }
    }

    renderer.render(scene, camera);
}

// Render current card
function render() {
    if (cards.length === 0) {
        show(emptyMsg);
        hide(cardViewer);
        hide(counter);
        hide(cardBtns);
        hide(editBtns);
        return;
    }

    hide(emptyMsg);
    show(cardViewer);
    show(counter);
    show(cardBtns);
    show(editBtns);

    if (currentIndex >= cards.length) currentIndex = cards.length - 1;
    if (currentIndex < 0) currentIndex = 0;

    isFlipped = false;
    cardMesh.rotation.y = 0;
    updateCardTextures();
    counter.textContent = `${currentIndex + 1} / ${cards.length}`;
}

function flip() {
    if (!cards.length) return;
    isFlipped = !isFlipped;
    startFlipAnimation();
}

function next() {
    if (!cards.length) return;
    currentIndex = (currentIndex + 1) % cards.length;
    render();
}

function prev() {
    if (!cards.length) return;
    currentIndex = (currentIndex - 1 + cards.length) % cards.length;
    render();
}

function closeForm() {
    editingId = null;
    hide(cardForm);
    hide(modalOverlay);
}

// New card — open empty compact form.
$("new-card-btn").addEventListener("click", () => {
    editingId = null;
    frontInput.value = "";
    backInput.value = "";
    show(cardForm);
    show(modalOverlay);
    frontInput.focus();
});

// Clear all cards.
$("clear-all-btn").addEventListener("click", () => {
    if (!cards.length || !confirm("Clear all cards?")) return;
    cards = [];
    currentIndex = 0;
    save();
    render();
});

// Edit card — open form with current card data.
$("edit-btn").addEventListener("click", () => {
    if (!cards.length) return;
    editingId = cards[currentIndex].id;
    frontInput.value = cards[currentIndex].front;
    backInput.value = cards[currentIndex].back;
    show(cardForm);
    show(modalOverlay);
    frontInput.focus();
});

// Save — create new or update existing.
$("save-btn").addEventListener("click", () => {
    const front = frontInput.value.trim();
    const back = backInput.value.trim();
    if (!front || !back) return;

    if (editingId) {
        const card = cards.find((c) => c.id === editingId);
        if (card) {
            card.front = front;
            card.back = back;
        }
    } else {
        cards.push({ id: Date.now().toString(), front, back });
        currentIndex = cards.length - 1;
    }

    save();
    closeForm();
    render();
});

// Cancel form.
$("cancel-btn").addEventListener("click", closeForm);
modalOverlay.addEventListener("click", closeForm);

// Delete current card.
$("delete-btn").addEventListener("click", () => {
    if (!cards.length || !confirm("Delete this card?")) return;
    cards.splice(currentIndex, 1);
    if (currentIndex >= cards.length) currentIndex = cards.length - 1;
    save();
    render();
});

// Flip controls and navigation.
$("flip-btn").addEventListener("click", flip);
cardViewer.addEventListener("click", () => flip());
$("next-btn").addEventListener("click", next);
$("prev-btn").addEventListener("click", prev);

speedSlider.addEventListener("input", () => {
    const speed = speedSlider.value / 10;
    speedLabel.textContent = `${speed.toFixed(1)}s`;
    flipDuration = speed * 1000;
});

// Keyboard: Space=flip, arrows=navigate.
document.addEventListener("keydown", (e) => {
    if (["input", "textarea"].includes(e.target.tagName.toLowerCase())) return;
    if (e.key === " ") {
        e.preventDefault();
        flip();
    }
    if (e.key === "ArrowRight") {
        e.preventDefault();
        next();
    }
    if (e.key === "ArrowLeft") {
        e.preventDefault();
        prev();
    }
});

initThree();
speedSlider.dispatchEvent(new Event("input"));
render();
requestAnimationFrame(animate);
