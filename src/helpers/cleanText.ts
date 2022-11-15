export const cleanText = (text: string | undefined) => {
	if (!text) return text;
	text = text.replace(/\r?\n/g, '');
	text = text.trim();
	return text;
};
