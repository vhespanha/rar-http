const { RarFilesPackage } = require('rar-stream')
const urlToFileMedia = require('./urlToFileMedia')
const store = require('./store')
const parseQuery = require('./parseQuery')
const safeStatelessRegex = require('safe-stateless-regex')
const namedQueue = require('named-queue')

const q = new namedQueue(async (task, cb) => {
	const { opts, query } = task
	const rarUrls = getRarUrls(query)
	try {
		rarStreams[task.url] =
			rarStreams[task.url] || (await streamRar(rarUrls, opts))
	} catch (e) {
		console.error(e)
		cb(null)
		return
	}
	cb(rarStreams[task.url])
}, 10)

const rarStreams = {}

function getRarUrls(query) {
	let rarUrls = []
	let key = query.key
	if (key && store.get(key)) {
		rarUrls = store.get(key)
	} else {
		// there is an issue here, as there is such a thing as an url that is too long
		// it would be cropped in this case and some rar parts could be missing..
		// using /create-rar to get a token prior to using the /rar endpoint solves this
		rarUrls = query.r || []
		if (typeof rarUrls === 'string') rarUrls = [rarUrls]
	}
	return rarUrls
}

const streamRar = async (urls, opts = {}) => {
	const rarFiles = []
	for (let url of urls) rarFiles.push(urlToFileMedia(url))

	let promisedFiles

	try {
		promisedFiles = await Promise.all(rarFiles)
	} catch (e) {
		throw Error(e)
	}

	const rarStreamPackage = new RarFilesPackage(fileResults)

	if (!(opts.fileMustInclude || []).length && !opts.hasOwnProperty('fileIdx'))
		opts = { fileMustInclude: [/.mkv$|.mp4$|.avi$/i] }

	const rarStreamOpts = {
		maxFiles: 1,
		filter: function (name, idx) {
			if ((opts.fileMustInclude || []).length) {
				return !!opts.fileMustInclude.find(reg => {
					const pattern =
						typeof reg === 'string' ? new RegExp(reg) : reg
					return safeStatelessRegex(name || '', pattern, 500)
				})
			}

			if (opts.hasOwnProperty('fileIdx')) {
				return opts.fileIdx === idx
			}

			return true
		}
	}

	let innerFiles = []
	try {
		innerFiles = await rarStreamPackage.parse(rarStreamOpts)
	} catch (e) {
		throw Error(e)
	}
	if (!innerFiles[0]) {
		throw Error('no file matching ' + JSON.stringify(opts))
	}

	return innerFiles[0]
}

function promiseRarStream(task) {
	return new Promise((resolve, reject) => {
		task.id = task.query.key
		q.push(task, rarStream => {
			resolve(rarStream)
		})
	})
}

async function getRarStream(req) {
	const task = parseQuery(req)
	task.url = req.url
	try {
		rarStream = await promiseRarStream(task)
	} catch (e) {
		console.error(e)
	}
	return rarStream
}

module.exports = getRarStream
