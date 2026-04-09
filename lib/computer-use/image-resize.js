// Port of the API's image transcoder target-size algorithm.
// Pre-sizing screenshots to this function's output means the API's early-return
// fires (tokens <= max) and the image is NOT resized server-side — so the model
// sees exactly the dimensions we send and coordinate scaling stays coherent.
//
// Rust reference: api/api/image_transcoder/rust_transcoder/src/utils/resize.rs
// TS reference: @ant/computer-use-mcp/src/imageResize.ts

var API_RESIZE_PARAMS = {
  pxPerToken: 28,
  maxTargetPx: 1568,
  maxTargetTokens: 1568,
};

/** ceil(px / pxPerToken). Matches resize.rs:74-76 (integer ceil-div). */
function nTokensForPx(px, pxPerToken) {
  return Math.floor((px - 1) / pxPerToken) + 1;
}

function nTokensForImg(width, height, pxPerToken) {
  return nTokensForPx(width, pxPerToken) * nTokensForPx(height, pxPerToken);
}

/**
 * Binary-search for the largest image that:
 *   - preserves aspect ratio
 *   - has long edge <= maxTargetPx
 *   - has ceil(w/pxPerToken) * ceil(h/pxPerToken) <= maxTargetTokens
 *
 * Returns [width, height].
 *
 * @param {number} width  - physical pixel width (logicalW * scaleFactor)
 * @param {number} height - physical pixel height (logicalH * scaleFactor)
 * @param {object} [params] - resize params (defaults to API_RESIZE_PARAMS)
 * @returns {number[]} [targetWidth, targetHeight]
 */
function targetImageSize(width, height, params) {
  if (!params) params = API_RESIZE_PARAMS;
  var pxPerToken = params.pxPerToken;
  var maxTargetPx = params.maxTargetPx;
  var maxTargetTokens = params.maxTargetTokens;

  // Already fits — no resize needed
  if (
    width <= maxTargetPx &&
    height <= maxTargetPx &&
    nTokensForImg(width, height, pxPerToken) <= maxTargetTokens
  ) {
    return [width, height];
  }

  // Normalize to landscape for the search; transpose result back
  if (height > width) {
    var flipped = targetImageSize(height, width, params);
    return [flipped[1], flipped[0]];
  }

  var aspectRatio = width / height;
  var upperBoundWidth = width;
  var lowerBoundWidth = 1;

  for (;;) {
    if (lowerBoundWidth + 1 === upperBoundWidth) {
      return [
        lowerBoundWidth,
        Math.max(Math.round(lowerBoundWidth / aspectRatio), 1),
      ];
    }

    var middleWidth = Math.floor((lowerBoundWidth + upperBoundWidth) / 2);
    var middleHeight = Math.max(Math.round(middleWidth / aspectRatio), 1);

    if (
      middleWidth <= maxTargetPx &&
      nTokensForImg(middleWidth, middleHeight, pxPerToken) <= maxTargetTokens
    ) {
      lowerBoundWidth = middleWidth;
    } else {
      upperBoundWidth = middleWidth;
    }
  }
}

/**
 * Compute target dims for a display's screenshot.
 * logicalW/logicalH are the display's logical dimensions,
 * scaleFactor is the display's backing scale factor (e.g. 2.0 for Retina).
 *
 * @param {number} logicalW
 * @param {number} logicalH
 * @param {number} scaleFactor
 * @returns {number[]} [targetWidth, targetHeight]
 */
function computeTargetDims(logicalW, logicalH, scaleFactor) {
  var physW = Math.round(logicalW * scaleFactor);
  var physH = Math.round(logicalH * scaleFactor);
  return targetImageSize(physW, physH, API_RESIZE_PARAMS);
}

module.exports = {
  targetImageSize: targetImageSize,
  computeTargetDims: computeTargetDims,
  API_RESIZE_PARAMS: API_RESIZE_PARAMS,
  nTokensForPx: nTokensForPx,
};
