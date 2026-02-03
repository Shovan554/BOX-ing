import * as THREE from 'three';
import { initFooter } from './Footer.js';

// Initialize Footer
initFooter('footer-container');

const startBtn = document.getElementById('start-btn');
const homeScreen = document.getElementById('home-screen');
const menuScreen = document.getElementById('menu-screen');
const gameTitle = document.getElementById('game-title');
const gameContainer = document.getElementById('game-container');

// Background Parallax Effect
window.addEventListener('mousemove', (e) => {
    // Only apply parallax if we're not in the middle of a game
    if (gameContainer.innerHTML === '') {
        const moveX = (e.clientX - window.innerWidth / 2) * 0.01;
        const moveY = (e.clientY - window.innerHeight / 2) * 0.01;
        document.body.style.backgroundPosition = `calc(50% + ${moveX}px) calc(50% + ${moveY}px)`;
    }
});

function openMenu() {
    // Start sliding components out
    startBtn.classList.add('slide-out');
    gameTitle.classList.add('slide-up');
    
    // Wait for animation
    setTimeout(() => {
        homeScreen.classList.add('hidden');
        menuScreen.classList.remove('hidden');
    }, 500); // matching the 0.5s animation in CSS
}

startBtn.addEventListener('click', openMenu);

// Keep the enter key for starting too
window.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !homeScreen.classList.contains('hidden')) {
        openMenu();
    }
});

// Resizing
window.addEventListener('resize', () => {
    // Future implementation for Three.js resizing if needed
});
