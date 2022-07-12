import MySQLdb
from flask import Flask, request, render_template
from configparser import ConfigParser
import json
import re

app = Flask(__name__)
config = ConfigParser('')
config.read('config.ini')

def dec_to_str(dec):
	return str(dec.to_integral() if dec == dec.to_integral() else dec.normalize())

@app.route('/')
def main():
	return render_template('index.html')
	
@app.route('/api/languages')
def api_languages():
	db = MySQLdb.connect(
		host = 'localhost' if config.getboolean('General', 'dev') else 'meta.web.db.svc.wikimedia.cloud',
		port = 4711 if config.getboolean('General', 'dev') else 3306,
		user = config['Database']['user'],
		password = config['Database']['pass'],
		db = 'meta_p'
	)

	cursor = db.cursor()

	cursor.execute('''
		SELECT url FROM wiki
		WHERE family = 'wikipedia' AND is_closed = 0
	''')
	
	out = []
	
	for row in cursor.fetchall():
		out.append(re.match(r'https:\/\/([^.]+)\.wikipedia\.org', row[0])[1])

	return json.dumps(out)

@app.route('/api/nearby')
def api_nearby():
	lang = request.args.get('lang', 'en').strip()
	query = request.args.get('q', '').strip()
	offset = request.args.get('offset', 0, type=int)
	lat = None
	lon = None

	match = re.match(r'(-?[0-9.]*)[,;][ _]?(-?[0-9.]*)', query)
	
	if not query:
		return json.dumps({
			'error': 'Missing coordinates or article name.'
		}), 400
	
	if match:
		lat = match.group(1)
		lon = match.group(2)

	db = MySQLdb.connect(
		host = 'localhost' if config.getboolean('General', 'dev') else 'meta.web.db.svc.wikimedia.cloud',
		port = 4711 if config.getboolean('General', 'dev') else 3306,
		user = config['Database']['user'],
		password = config['Database']['pass'],
		db = 'meta_p'
	)

	cursor = db.cursor()
	
	cursor.execute(
		'''
			SELECT dbname FROM wiki
			WHERE family = 'wikipedia' AND is_closed = 0 AND url = %s
			LIMIT 1
		''',
		(f'https://{lang}.wikipedia.org',)
	)
	
	res = cursor.fetchone()
	
	if not res:
		return json.dumps({
			'error': f'Could not find Wikipedia with language code {lang}.'
		}), 400
		
	db_name = res[0]

	db = MySQLdb.connect(
		host = 'localhost' if config.getboolean('General', 'dev') else f'{db_name}.web.db.svc.wikimedia.cloud',
		port = 4712 if config.getboolean('General', 'dev') else 3306,
		user = config['Database']['user'],
		password = config['Database']['pass'],
		db = f'{db_name}_p'
	)

	cursor = db.cursor()
	
	if not lat:
		query = query[0].upper() + query[1:]
		query = query.replace(' ', '_')
		
		cursor.execute(
			'''
				SELECT gt_lat, gt_lon FROM geo_tags
				JOIN page ON gt_page_id = page_id AND page_namespace = 0
				WHERE gt_primary = 1 AND page_namespace = 0 AND page_title = %s
				LIMIT 1
			''',
			(query,)
		)
		
		pair = cursor.fetchone()

		if not pair:
			return json.dumps({
				'error': 'Page does not have coordinates.'
			}), 400
		
		lat = dec_to_str(pair[0])
		lon = dec_to_str(pair[1])

	cursor.execute(
		'''
			SET @sin_lat = SIN(%s * PI() / 180);
			SET @cos_lat = COS(%s * PI() / 180);
			SET @lon = %s * PI() / 180;
		
			SELECT gt_lat, gt_lon, page_title, pp1.pp_value, pp2.pp_value, pp3.pp_value,
			# Spherical law of cosines, https://www.movable-type.co.uk/scripts/latlong.html#cosine-law
			ACOS(@sin_lat * SIN(gt_lat * PI() / 180) + @cos_lat * COS(gt_lat * PI() / 180) * COS(gt_lon * PI() / 180 - @lon)) * 6371 as dist
			FROM geo_tags
			JOIN page ON gt_page_id = page_id AND page_namespace = 0
			LEFT JOIN page_props pp1 ON page_id = pp1.pp_page AND pp1.pp_propname = 'wikibase-shortdesc'
			LEFT JOIN page_props pp2 ON page_id = pp2.pp_page AND pp2.pp_propname = 'page_image_free'
			LEFT JOIN page_props pp3 ON page_id = pp3.pp_page AND pp3.pp_propname = 'page_image' AND pp2.pp_value IS NULL
			WHERE gt_primary = 1
			ORDER BY dist
			LIMIT %s, 100;
		''',
		(lat, lat, lon, offset * 100)
	)
	
	while not cursor.rowcount:
		cursor.nextset()

	out = []
	
	for row in cursor.fetchall():
		out.append({
			'lat': dec_to_str(row[0]),
			'lon': dec_to_str(row[1]),
			'page': row[2].decode(),
			'desc': row[3].decode() if row[3] else None,
			'img': row[4].decode() if row[4] else (row[5].decode() if row[5] else None),
			'dist': f'{row[6]:0.2f}'
		})
	
	return json.dumps({
		'lat': lat,
		'lon': lon,
		'list': out
	})

if __name__ == '__main__':
	app.run(debug = config.getboolean('General', 'dev'))