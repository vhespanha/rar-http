const Router = require('router')
const bodyParser = require('body-parser')
const getRarStream = require('./getRarStream')
const getContentType = require('./getContentType')
const keyHandler = require('./keyHandler')

require('./store')
require('./parseQuery')

new (require('events'))()

function getRouter() {
	const router = Router()

	router.use(bodyParser.json())

	router.post(
		'/create/:createKey',
		keyHandler.createKey.bind(null, 'rar', null, null)
	)

	router.all('/create', keyHandler.createKey.bind(null, 'rar', null, null))

	router.get('/stream', async (req, res) => {
		try {
			await keyHandler.waitForKey(req)
		} catch (e) {
			console.error(e)
			res.statusCode = 500
			res.end()
			return
		}
		let rarInnerFile
		try {
			rarInnerFile = await getRarStream(req)
		} catch (e) {
			console.error(e)
			res.statusCode = 500
			res.end()
			return
		}
		if (!rarInnerFile) {
			const errMsg = 'There was an error with the rar parser.'
			console.error(Error(errMsg))
			res.statusCode = 500
			res.end(errMsg)
			return
		}
		if (req.method === 'HEAD') {
			res.statusCode = 204
			res.setHeader('Accept-Ranges', 'bytes')
			res.setHeader('Content-Length', rarInnerFile.length + '')
			res.setHeader('Content-Type', getContentType(rarInnerFile))
			res.end()
			return
		}
		const fileSize = rarInnerFile.length
		const range = req.headers.range

		let start = 0
		let end = fileSize - 1

		res.setHeader('Accept-Ranges', 'bytes')
		res.setHeader('Content-Type', getContentType(rarInnerFile))

		if (Object.values(range || {}).length) {
			const parts = range.replace(/bytes=/, '').split('-')
			start = parseInt(parts[0], 10) || 0
			end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1
			res.statusCode = 206
			res.setHeader('Content-Range', `bytes ${start}-${end}/${fileSize}`)
			const chunksize = end - start + 1
			res.setHeader('Content-Length', chunksize + '')
		} else {
			res.statusCode = 200
			res.setHeader('Content-Length', fileSize + '')
		}
		const readable = await rarInnerFile.createReadStream({ start, end })

		req.on('close', function () {
			readable.stream.request.abort()
		})

		readable.pipe(res)
	})

	return router
}

module.exports = getRouter
