// Coordinate scaling from screenshot image-pixels to logical display points.
// The model sends coordinates in the downscaled screenshot's pixel space.
// We need to map them to the display's logical coordinate space.
//
// Formula (pixels mode):
//   logicalX = rawX * (displayWidth / screenshotWidth) + originX
//   logicalY = rawY * (displayHeight / screenshotHeight) + originY

function createCoordScaler() {
  // Updated on each screenshot
  var lastScreenshot = null;
  var displayGeometry = null;

  function setScreenshotDims(dims) {
    // dims: { width, height, scaledWidth, scaledHeight }
    // scaledWidth/scaledHeight = the image dimensions sent to the model
    lastScreenshot = dims;
  }

  function setDisplayGeometry(geo) {
    // geo: { width, height, originX, originY, scaleFactor }
    displayGeometry = geo;
  }

  function scaleCoord(rawX, rawY) {
    if (!lastScreenshot || !displayGeometry) {
      // No screenshot taken yet or display geometry unknown — pass through
      return { x: rawX, y: rawY };
    }

    var ssWidth = lastScreenshot.scaledWidth || lastScreenshot.width;
    var ssHeight = lastScreenshot.scaledHeight || lastScreenshot.height;
    if (ssWidth <= 0 || ssHeight <= 0) {
      return { x: rawX, y: rawY };
    }

    var scaleX = displayGeometry.width / ssWidth;
    var scaleY = displayGeometry.height / ssHeight;
    var originX = displayGeometry.originX || 0;
    var originY = displayGeometry.originY || 0;

    return {
      x: Math.round(rawX * scaleX + originX),
      y: Math.round(rawY * scaleY + originY),
    };
  }

  function hasContext() {
    return !!(lastScreenshot && displayGeometry);
  }

  return {
    setScreenshotDims: setScreenshotDims,
    setDisplayGeometry: setDisplayGeometry,
    scaleCoord: scaleCoord,
    hasContext: hasContext,
  };
}

module.exports = { createCoordScaler: createCoordScaler };
