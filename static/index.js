let currentOffset,
	currentLanguage,
	currentQuery,
	prefixSearchAbort,
	apiAbort;

function create(type, attrs, ...children) {
	let el = document.createElement(type);
	
	if (typeof attrs === 'string' || attrs instanceof Node) {
		children.unshift(attrs);
		attrs = {};
	}
	
	for (let key in attrs) el.setAttribute(key, attrs[key]);
	
	el.append(...children);
	
	return el;
}

async function callAPI(lang, query, append = false) {
	lang = lang || 'en';
	
	if (!query) {
		document.getElementById('top').replaceChildren('Error: Missing article or coordinates');
		document.getElementById('list').replaceChildren();
		return;
	}
	
	window.removeEventListener('scroll', infiniteScroll);

	query = query.replace(/_/g, '');
	query = query[0].toUpperCase() + query.slice(1);
	
	document.getElementById('lang').value = lang;
	document.getElementById('query').value = query;
	
	if (append) {
		currentOffset++;
	} else {
		document.title = `${query} - WikiNearby`;
		
		let params = new URLSearchParams(location.search);
		let sameState = query == params.get('q') && lang == (params.get('lang') || 'en');
		
		history[sameState ? 'replaceState' : 'pushState']({}, '', `?${new URLSearchParams({
			q: query,
			lang: lang
		})}`);

		currentOffset = 0;

		document.getElementById('top').replaceChildren();
		document.getElementById('list').replaceChildren();
	}

	document.getElementById('loading').style.display = 'block';
	
	apiAbort?.abort();
	apiAbort = new AbortController();
	
	let res = await fetch(`/api/nearby?${new URLSearchParams({
			q: query,
			lang: lang,
			offset: currentOffset
		})}`, {
			signal: apiAbort.signal
		});

	document.getElementById('loading').style.display = '';

	if (res.status === 500) {
		document.title = 'Error - WikiNearby';
		document.getElementById('top').replaceChildren('Error: An internal error has occurred!',);
	}

	let data = await res.json();
	
	if (data.error) {
		document.title = 'Error - WikiNearby';
		document.getElementById('top').replaceChildren(`Error: ${data.error}`);
		return;
	}

	document.getElementById('top').replaceChildren(
		'Results for ',
		getGeoHackLink(data.lat, data.lon)
	);
	
	document.getElementById('list')[append ? 'append' : 'replaceChildren'](
		...data.list.map(entry => create('div', {class: 'list-entry'}, 
			entry.img
				? create('img', {
					src: `https://${lang}.wikipedia.org/wiki/Special:Redirect/file/${encodeURIComponent(entry.img)}?width=125`,
					class: 'list-entry-image',
					loading: 'lazy'
				})
				: create('span', {class: 'list-entry-image'}),
			create('div', {class: 'list-entry-text'}, 
				create('div',
					create('a', {
						href: `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(entry.page)}`,
						class: 'primary-link',
						target: '_blank'
					}, entry.page.replace(/_/g, ' '))
				),
				create('div', entry.desc),
				create('div',
					getGeoHackLink(entry.lat, entry.lon),
					create('span', ` (${getDistance(data.lat, data.lon, entry.lat, entry.lon)})`)
				)
			)
		))
	);

	currentLanguage = lang;
	currentQuery = query;

	window.addEventListener('scroll', infiniteScroll, { passive: true });
}

function getGeoHackLink(lat, lon) {
	return create('a', {
		href:`https://geohack.toolforge.org/geohack.php?params=${lat};${lon}}`,
		class: 'secondary-link',
		target: '_blank'
	}, `${lat}, ${lon}`);
}

function getInput(name) {
	return document.getElementById(name).value;
}

function useForm() {
	callAPI(getInput('lang'), getInput('query'));
}

function infiniteScroll() {
	if (document.documentElement.scrollTop + document.documentElement.clientHeight >= document.documentElement.scrollHeight - 100) {
		callAPI(currentLanguage, currentQuery, true);
	}
}

function useCoords({coords}) {
	callAPI(getInput('lang'), `${coords.latitude}, ${coords.longitude}`);
}

function getDistance(lat1, lon1, lat2, lon2) {
	lat1 = lat1 * Math.PI / 180;
	lon1 = lon1 * Math.PI / 180;
	lat2 = lat2 * Math.PI / 180;
	lon2 = lon2 * Math.PI / 180;

	// Haversine formula
	let d = 2 * 6371 * Math.asin(Math.sqrt(Math.pow(Math.sin((lat2 - lat1) / 2), 2) + Math.cos(lat1) * Math.cos(lat2) * Math.pow(Math.sin((lon2 - lon1) / 2), 2)));

	return `${+d.toFixed(2)} km`;
}

async function prefixSearch() {
	prefixSearchAbort?.abort();
	prefixSearchAbort = new AbortController();
	
	if (!getInput('query')) {
		document.getElementById('query-datalist').replaceChildren();
		return;
	}
	
	let res = await fetch(`https://${getInput('lang') || 'en'}.wikipedia.org/w/api.php?${new URLSearchParams({
			action: 'query',
			generator: 'prefixsearch',
			formatversion: 2,
			gpssearch: getInput('query'),
			format: 'json',
			origin: '*'
		})}`, {
			signal: prefixSearchAbort.signal
		}),
		data = await res.json(),
		pages = data?.query?.pages || [];
	
	pages.sort((a, b) => a.index - b.index);
	
	document.getElementById('query-datalist').replaceChildren(...pages.map(page => create('option', {value: page.title})));
}

function processURL() {
	let params = new URLSearchParams(location.search),
		query = params.get('q');
		
	if (!query) return;
	
	callAPI(params.get('lang'), query);
}

async function getLanguageSelection() {
	let res = await fetch('/api/languages'),
		langs = await res.json();
		
	document.getElementById('lang-datalist').replaceChildren(...langs.map(lang => create('option', {value: lang})));
}

processURL();
getLanguageSelection();

window.addEventListener('popstate', processURL);
document.getElementById('query').addEventListener('input', prefixSearch);
document.getElementById('submit').addEventListener('click', useForm);
document.getElementById('locate').addEventListener('click', () => navigator.geolocation.getCurrentPosition(useCoords));