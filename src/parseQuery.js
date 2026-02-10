const isRegex = /^\/(.*)\/(.*)$/

function parseQuery(req) {
	let opts = {}
	try {
		opts = JSON.parse(req.query.o)
	} catch (e) {}
	if ((opts.fileMustInclude || []).length) {
		opts.fileMustInclude = opts.fileMustInclude.map(el => {
			if ((el || '').match(isRegex)) {
				const parts = isRegex.exec(el)
				try {
					return new RegExp(parts[1], parts[2])
				} catch (e) {}
			}
			return el
		})
	}
	return { opts, query: req.query }
}

module.exports = parseQuery
