export function initFooter(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const footer = document.createElement('footer');
    footer.className = 'footer';
    footer.innerHTML = `
        <p>&copy; ${new Date().getFullYear()} Box-ing Game. All rights reserved.</p>
    `;
    container.appendChild(footer);
}
