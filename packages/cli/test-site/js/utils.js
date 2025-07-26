// Utility functions for the test site

function formatDate(date) {
	return new Date(date).toLocaleDateString();
}

function debounce(func, wait) {
	let timeout;
	return function executedFunction(...args) {
		const later = () => {
			clearTimeout(timeout);
			func(...args);
		};
		clearTimeout(timeout);
		timeout = setTimeout(later, wait);
	};
}

function generateId() {
	return Math.random().toString(36).substr(2, 9);
}

const utils = {
	formatDate,
	debounce,
	generateId,
};

export default utils;
