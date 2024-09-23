const log = require('./logger');
const { getContentDetailsById, getImdbId } = require('../api/tmdb');

const prepareStreams = async (content, apiKey, language, showRating, showTagline, userAgent = '', type) => {
    const today = new Date();

    if (!Array.isArray(content)) {
        throw new TypeError('Expected content to be an array');
    }

    const contentDetails = await Promise.all(
        content.map(item => getContentDetailsById(item, type, apiKey, language))
    );

    const imdbIdResults = await Promise.all(contentDetails.map(async item => {
        return (new Date(item.released) <= today) ? getImdbId(item.id, type, apiKey, language) : null;
    }));

    const preparedContent = contentDetails.map((item, index) => {
        const rating = showRating ? (item.rating?.toFixed(1) || 'N/A') : '';
        const ratingValue = parseFloat(rating);
        const emoji = ratingValue > 0 ? ratingToEmoji(ratingValue) : '';
        const ratingText = ratingValue > 0 ? `${rating} ${emoji}` : '';
        const voteCountText = showRating && item.vote_count ? ` (${formatVoteCount(item.vote_count)} 👥)` : '';

        const externalUrl = item.released
            ? (new Date(item.released) > today
                ? `https://www.themoviedb.org/${type}/${item.id}`
                : userAgent.includes('Stremio')
                    ? `stremio:///detail/${type}/${imdbIdResults[index] || ''}`
                    : `https://web.stremio.com/#/detail/${type}/${imdbIdResults[index] || ''}`)
            : `https://www.themoviedb.org/${type}/${item.id}`;

        const newLine = '\n';
        const title = `${item.title}${ratingText ? `${newLine}${ratingText}` : ''}${voteCountText ? `${voteCountText}` : ''}${showTagline && item.tagline ? `${newLine}${item.tagline}` : ''}`;

        return {
            name: item.released ? item.released.match(/^\d{4}/)?.[0] || 'TMDB' : 'TMDB',
            title: title,
            externalUrl: externalUrl,
            rating: rating,
            ratingValue: ratingValue,
            emoji: emoji,
            ratingText: ratingText,
            voteCountText: voteCountText
        };
    });

    return preparedContent;
};


const formatVoteCount = (voteCount) => {
    if (voteCount >= 1000000) {
        return `${Math.round(voteCount / 1000000)}M`;
    } else if (voteCount >= 1000) {
        return `${Math.round(voteCount / 1000)}k`;
    }
    return voteCount.toString();
};

const ratingToEmoji = (rating) => {
    if (rating >= 9) return '🏆';
    if (rating >= 8) return '🔥';
    if (rating >= 6) return '⭐';
    if (rating >= 5) return '😐';
    return '🥱';
};

module.exports = {
    prepareStreams
};
