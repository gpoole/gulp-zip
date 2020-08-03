'use strict';
const path = require('path');
const Vinyl = require('vinyl');
const PluginError = require('plugin-error');
const through = require('through2');
const Yazl = require('yazl');
const getStream = require('get-stream');

module.exports = (filename, options) => {
	if (!filename) {
		throw new PluginError('gulp-zip', '`filename` required');
	}

	options = {
		compress: true,
		streamOutput: false,
		...options
	};

	let firstFile;
	const zip = new Yazl.ZipFile();

	return through.obj((file, encoding, callback) => {
		if (!firstFile) {
			firstFile = file;
		}

		// Because Windows...
		const pathname = file.relative.replace(/\\/g, '/');

		if (!pathname) {
			callback();
			return;
		}

		if (file.isNull() && file.stat && file.stat.isDirectory && file.stat.isDirectory()) {
			zip.addEmptyDirectory(pathname, {
				mtime: options.modifiedTime || file.stat.mtime || new Date()
				// Do *not* pass a mode for a directory, because it creates platform-dependent
				// ZIP files (ZIP files created on Windows that cannot be opened on macOS).
				// Re-enable if this PR is resolved: https://github.com/thejoshwolfe/yazl/pull/59
				// mode: file.stat.mode
			});
		} else {
			const stat = {
				compress: options.compress,
				mtime: options.modifiedTime || (file.stat ? file.stat.mtime : new Date()),
				mode: file.stat ? file.stat.mode : null
			};

			if (file.isStream()) {
				zip.addReadStream(file.contents, pathname, stat);
			}

			if (file.isBuffer()) {
				zip.addBuffer(file.contents, pathname, stat);
			}
		}

		callback();
	}, function (callback) {
		if (!firstFile) {
			callback();
			return;
		}

		(async () => {
			let data;
			if (options.streamOutput) {
				data = zip.outputStream;
			} else {
				try {
					data = await getStream.buffer(zip.outputStream);
				} catch (error) {
					if (error instanceof RangeError && (!error.code || error.code === 'ERR_INVALID_OPT_VALUE' || error.code === 'ERR_OUT_OF_RANGE')) {
						callback(new PluginError('gulp-zip', 'The output zip file is too big to store in a buffer (larger than Buffer MAX_LENGTH). Try using the streamOutput option.'));
						return;
					}

					callback(error);
				}
			}

			this.push(new Vinyl({
				cwd: firstFile.cwd,
				base: firstFile.base,
				path: path.join(firstFile.base, filename),
				contents: data
			}));

			callback();
		})();

		zip.end();
	});
};
