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

async function callAPI(lang, query, append = false, mainPage = false) {
	window.removeEventListener('scroll', infiniteScroll);

	apiAbort?.abort();
	document.getElementById('loading').style.display = '';
	
	if (query) {
		query = query.replace(/_/g, ' ');
		query = query[0].toUpperCase() + query.slice(1);

		lang = lang || 'en';
	}

	document.getElementById('lang').value = lang;
	document.getElementById('query').value = query;

	if (append) {
		currentOffset++;
	} else {
		currentOffset = 0;
		
		let currParams = new URLSearchParams(location.search);
		
		if (query !== (currParams.get('q') || '') || lang !== (currParams.get('lang') || '')) {
			let params = new URLSearchParams();

			if (lang) params.set('lang', lang);
			if (query) params.set('q', query);
			
			history.pushState({}, '', `/${params.toString() ? '?' : ''}${params.toString()}`);
		}

		document.getElementById('top').replaceChildren((!query && !mainPage) ? 'Error: Missing article or coordinates' : '');
		document.getElementById('list').replaceChildren();
		
		document.title = (query || !mainPage) ? `${query || 'Error'} - WikiNearby` : 'WikiNearby';
	}
	
	document.getElementById('about').style.display = (!query && mainPage) ? '' : 'none';
	
	if (!query) return;

	document.getElementById('about').style.display = 'none';
	document.getElementById('loading').style.display = 'block';
	
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
		document.getElementById('top').replaceChildren('Error: An internal error has occurred!');
	}

	let data = await res.json();
	
	if (data.error) {
		document.title = 'Error - WikiNearby';
		document.getElementById('top').replaceChildren(`Error: ${data.error}`);
		return;
	}

	document.getElementById('top').replaceChildren(
		'Results for ',
		getGeoHackLink(data.lat, data.lon, lang)
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
					getGeoHackLink(entry.lat, entry.lon, lang, entry.page),
					create('span', ` (${entry.dist} km)`)
				)
			)
		))
	);

	currentLanguage = lang;
	currentQuery = query;

	window.addEventListener('scroll', infiniteScroll, { passive: true });
}

function getGeoHackLink(lat, lon, lang, pagename = '') {
	return create('a', {
		href:`https://geohack.toolforge.org/geohack.php?${new URLSearchParams({
			language: lang,
			pagename: pagename,
			params: `${lat};${lon}`
		})}`,
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
	let params = new URLSearchParams(location.search);
	
	callAPI(params.get('lang') || '', params.get('q') || '', false, true);
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

document.getElementById('query').addEventListener('keypress', e => {
	if (e.key !== 'Enter') return;
	
	useForm();
});

document.getElementById('locate').addEventListener('click', () => {
	navigator.geolocation.getCurrentPosition(useCoords);
});

document.getElementById('h1-link').addEventListener('click', e => {
	e.preventDefault();
	
	callAPI('', '', false, true);
});