import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';
import { initFooter } from './Footer.js';

// Initialize Footer
initFooter('footer-container');

const startBtn = document.getElementById('start-btn');
const homeScreen = document.getElementById('home-screen');
const menuScreen = document.getElementById('menu-screen');
const gameTitle = document.getElementById('game-title');
const gameContainer = document.getElementById('game-container');
const grannyContainer = document.getElementById('granny-container');

let grannyScene, grannyCamera, grannyRenderer, grannyModel, mixer, clock;

function initGrannyModel() {
    grannyScene = new THREE.Scene();
    clock = new THREE.Clock();
    
    const aspect = grannyContainer.clientWidth / grannyContainer.clientHeight;
    grannyCamera = new THREE.PerspectiveCamera(45, aspect, 0.1, 1000);
    grannyCamera.position.set(0, 1.1, 2.2);

    grannyRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    grannyRenderer.setSize(grannyContainer.clientWidth, grannyContainer.clientHeight);
    grannyRenderer.setPixelRatio(window.devicePixelRatio);
    grannyContainer.appendChild(grannyRenderer.domElement);

    const ambientLight = new THREE.AmbientLight(0xffffff, 1.5);
    grannyScene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 2);
    directionalLight.position.set(2, 2, 5);
    grannyScene.add(directionalLight);

    const loader = new GLTFLoader();
    loader.load('./assets/models/granny/granny.glb', (gltf) => {
        grannyModel = gltf.scene;
        grannyModel.position.set(0, 0, 0);
        grannyScene.add(grannyModel);
        
        // Center and ground the model
        const box = new THREE.Box3().setFromObject(grannyModel);
        grannyModel.position.y = -box.min.y;

        // Play the embedded Mixamo animation
        if (gltf.animations && gltf.animations.length > 0) {
            mixer = new THREE.AnimationMixer(grannyModel);
            const action = mixer.clipAction(gltf.animations[0]);
            action.play();
        }
    });

    function animate() {
        requestAnimationFrame(animate);
        const delta = clock.getDelta();
        if (mixer) {
            mixer.update(delta);
        } else if (grannyModel) {
            grannyModel.rotation.y += 0.005;
        }
        grannyRenderer.render(grannyScene, grannyCamera);
    }
    animate();
}

function openMenu() {
    // Start sliding components out
    startBtn.classList.add('slide-out');
    gameTitle.classList.add('slide-up');
    
    // Wait for animation
    setTimeout(() => {
        homeScreen.classList.add('hidden');
        menuScreen.classList.remove('hidden');
        
        // Use a small delay to ensure DOM dimensions are ready
        requestAnimationFrame(() => {
            if (!grannyRenderer) {
                initGrannyModel();
            }
        });
    }, 500); // matching the 0.5s animation in CSS
}

startBtn.addEventListener('click', openMenu);

// Background Parallax Effect
window.addEventListener('mousemove', (e) => {
    // Only apply parallax if we're not in the middle of a game
    if (gameContainer.innerHTML === '') {
        const moveX = (e.clientX - window.innerWidth / 2) * 0.01;
        const moveY = (e.clientY - window.innerHeight / 2) * 0.01;
        document.body.style.backgroundPosition = `calc(50% + ${moveX}px) calc(50% + ${moveY}px)`;
    }
});

// Keep the enter key for starting too
window.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !homeScreen.classList.contains('hidden')) {
        openMenu();
    }
});

// Resizing
window.addEventListener('resize', () => {
    if (grannyRenderer && grannyContainer) {
        const width = grannyContainer.clientWidth;
        const height = grannyContainer.clientHeight;
        grannyCamera.aspect = width / height;
        grannyCamera.updateProjectionMatrix();
        grannyRenderer.setSize(width, height);
    }
});
