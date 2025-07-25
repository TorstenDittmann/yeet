// Main application JavaScript
console.log('Yeet test site loaded!');

function initApp() {
    document.addEventListener('DOMContentLoaded', function() {
        console.log('DOM loaded');
    });
}

const config = {
    version: '1.0.0',
    environment: 'test'
};

initApp();