const store = require('./store')
const parseQuery = require('./parseQuery')
const cryptojs = require('crypto')
const lzDecompress = require('lz-string').decompressFromEncodedURIComponent
const ee = require('events')
const initEmitter = new ee()

function storeDataToKey(arr, newKey, orderRegex, orderDefault) {
	if (newKey && store.get(newKey) !== null) {
		return newKey
	}

	arr = arr
		.map(el =>
			Array.isArray(el)
				? !!el[0] &&
					(el[1]
						? {
								url: el[0],
								bytes: el[1]
							}
						: {
								url: el[0]
							})
				: el
		)
		.filter(el => !!el)

	if (orderRegex) {
		arr = arr.sort((first, second) => {
			const firstMatch = ((first || {}).url || first || '')
				.split('?')[0]
				.match(orderRegex)
			const secondMatch = ((second || {}).url || second || '')
				.split('?')[0]
				.match(orderRegex)
			return (
				+((firstMatch && firstMatch[1]) || orderDefault || 0) -
				+((secondMatch && secondMatch[1]) || orderDefault || 0)
			)
		})
	}

	const key = store.set(arr, newKey)
	initEmitter.emit(key)

	return key
}

const createKey = function (archiveType, orderRegex, orderDefault, req, res) {
	if (req.method == 'POST') {
		if (!Array.isArray(req.body)) {
			res.statusCode = 500
			res.setHeader('Content-Type', 'text/plain')
			res.end('Cannot parse JSON data, err 1')
			return
		}

		const key = storeDataToKey(
			req.body,
			req.params.createKey,
			orderRegex,
			orderDefault
		)

		res.setHeader(
			'Content-Length',
			JSON.stringify({
				key
			}).length + ''
		)
		res.setHeader('Content-Type', 'application/json')
		res.end(
			JSON.stringify({
				key
			})
		)
	} else {
		if (!req.query.lz) {
			res.statusCode = 500
			res.setHeader('Content-Type', 'text/plain')
			res.end('Cannot parse JSON data, err 2')
			return
		}

		let lzData = false

		try {
			lzData = JSON.parse(lzDecompress(req.query.lz))
		} catch (e) {}

		if (!lzData || !lzData.urls || !lzData.urls.length) {
			res.statusCode = 500
			res.setHeader('Content-Type', 'text/plain')
			res.end('Cannot parse JSON data, err 3')
			return
		}

		txt = req.query.lz
		const hashKey = cryptojs.createHash('sha256').update(txt).digest('hex')

		storeDataToKey(lzData.urls, hashKey, orderRegex, orderDefault)

		opts = (function (lzData) {
			let opts = {}
			if (lzData.fileMustInclude) {
				opts.fileMustInclude = lzData.fileMustInclude
			}
			if (lzData.maxFiles && lzData.maxFiles > 0) {
				opts.maxFiles = lzData.maxFiles
			}
			if (lzData.fileIdx && lzData.fileIdx > -1) {
				opts.fileIdx = lzData.fileIdx
			}
			return !!Object.keys(opts).length && opts
		})(lzData)

		res.statusCode = 302
		res.setHeader(
			'Location',
			`/${archiveType}/stream?key=${hashKey}${opts ? '&o=' + encodeURIComponent(JSON.stringify(opts)) : ''}`
		)
		res.end()
	}
	var txt
}

const waitForKey = function (req) {
	return new Promise((resolve, reject) => {
		const key = parseQuery(req).query.key
		if (key) {
			if (store.get(key) === null) {
				initEmitter.addListener(key, function gotData() {
					initEmitter.removeListener(key, gotData)
					resolve()
				})
			} else {
				resolve()
			}
		} else {
			reject(Error('No stream key provided'))
		}
	})
}

module.exports = {
	createKey,
	waitForKey
}
