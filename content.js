class NormalPlayerObserver {
  // ytd-watch-flexy > #player-theater-container > #player-container > ytd-player#ytd-player > #container > #movie_player
  //                                                                                                                      > .html5-video-container > video
  //                                                                                                                      > .ytp-chrome-bottom > .ytp-chrome-controls > .ytp-left-controls

  /**
   * @param {(video: HTMLVideoElement, vcLeft: Element)} newPlayerCallback 
   */
  constructor(newPlayerCallback) {
    /**
     * @type {(video: HTMLVideoElement, vcLeft: Element)}
     */
    this._newPlayerCallback = newPlayerCallback

    this._find()
  }
  _find() {
    if (this._tryIdentify()) return

    document.addEventListener("yt-navigate-finish", this._onNavFinish.bind(this))

    // this._observeMutations()
  }
  _tryIdentify() {
    let video = document.querySelector('video')
    if (!video) return false

    let vcLeft = document.querySelector('.ytp-left-controls')
    if (!vcLeft) return false

    this._newPlayerCallback(video, vcLeft)
    return true
  }
  _onNavFinish() {
    this._tryIdentify()
  }
  _observeMutations() {
    this._observer = new MutationObserver(this._onMutation.bind(this))
    this._observer.observe(document, { childList: true, subtree: true })
  }
  _onMutation(mutationList, observer) {
    for (let mutation of mutationList) {
      for (let addedNode of mutation.addedNodes) {
        if (addedNode.nodeName !== 'VIDEO' || addedNode.nodeName !== 'DIV' || addedNode.className !== 'ytp-left-controls') continue

        if (this._tryIdentify()) {
            observer.disconnect()
            this._observer = null
        }
      }
    }
  }
}

class ShortsPlayerObserver {
  // Shorts player DOM element layout (video and controls):
  // #shorts-container > #shorts-inner-container > ytd-reel-video-renderer[id][is-active][show-player-controls] > #player-container
  //                                                                                                                            > ytd-player#player > #container.ytd-player > #shorts-player > .html5-video-container > video
  //                                                                                                                            > .player-controls > ytd-shorts-player-controls > yt-icon-button
  // #shorts-inner-container > ytd-reel-video-renderer is loaded and inserted in sets of 10
  // delayed async load and insert of #player-container > ytd-player#player

  /**
   * @param {(videoElement: HTMLVideoElement, controlsContainer: Element)} newPlayerCallback
   */
  constructor(newPlayerCallback) {
    /** @type {(videoElement: HTMLVideoElement, controlsContainer: Element)} */
    this._newPlayerCallback = newPlayerCallback
    /** @type {MutationObserver} */
    this._observer = new MutationObserver(this._onMutation.bind(this))
    this._observerVideo = new MutationObserver(this._onVideoMutation.bind(this))

    this._findAndObserve()
    document.addEventListener("yt-navigate-finish", this._findAndObserve.bind(this))
  }

  _findAndObserve() {
    let container = document.querySelector('#shorts-inner-container')
    if (!container) return
    this._observer.observe(container, { childList: true })
  }

  /**
   * @type {MutationCallback}
   */
  _onMutation(mutList, observer) {
    for (let mut of mutList) {
      if (mut.type !== 'childList') continue

      for (let newNode of mut.addedNodes) {
        if (newNode.nodeName !== 'YTD-REEL-VIDEO-RENDERER') continue

        let playerContainer = newNode.querySelector('#player-container')
        this._tryPlayerContainer(playerContainer)
      }
    }
  }

  _tryPlayerContainer(playerContainer) {
    let videoElement = playerContainer.querySelector('video')
    if (!videoElement) {
      this._observerVideo.observe(playerContainer, { childList: true })
      return
    }

    let controlsContainer = playerContainer.querySelector('.player-controls > ytd-shorts-player-controls')
    if (!controlsContainer) throw new Error('Unexpected: player controls container missing in player container')

    this._newPlayerCallback(videoElement, controlsContainer)
  }

  /**
   * @type {MutationCallback}
   */
  _onVideoMutation(mutList, observer) {
    for (let mut of mutList) {
      if (mut.type !== 'childList') continue

      for (let newNode of mut.addedNodes) {
        if (newNode.id !== 'player') continue

        let playerContainer = newNode.closest('#player-container')
        this._tryPlayerContainer(playerContainer)
      }
    }
  }
}

class Instance {
  /**
   * @param {HTMLVideoElement} video 
   * @param {Element} controlsContainer 
   */
  constructor(video, controlsContainer) {
    /** @type {HTMLVideoElement} */
    this._video = video
    this._controlsContainer = controlsContainer

    this._removeExisting()
    this._create()
    this._bind()
    this._updateRateDisplay()
    this._updateControlVisibility()
    this._insert()
  }
  _removeExisting() {
    let existing = this._controlsContainer.querySelector('.pbspeed-container')
    if (existing) existing.remove()
  }
_create() {
  let container = document.createElement('div');
  container.className = 'pbspeed-container';
  container.style = 'margin: 8px 9px 0px; display:flex; align-items:center; gap:12px; position:relative; height: 40px; border-radius: 20px; background-color: rgba(0, 0, 0, 0.3); padding-left: 12px;padding-right: 12px; margin-left: 0px;';

  const svgURL = browser.runtime.getURL("playbackSpeed.svg");
  let displayHTML = `
    <div class="rdisplay" style="grid-row:1; grid-column:1; font-size:18px; user-select:none; cursor:pointer; display:flex; align-items:center;">
      <img src="${svgURL}" class="pbspeed-icon" style="width:25px; height:25px; filter: drop-shadow(0px 0px 1.3px rgba(0,0,0,0.6)) !important; margin-left: -5px;"/>
      <span class="pbspeed-value" style="color:white; margin-left:6px; margin-right: 0px; font-size: 14px; text-shadow: rgba(0,0,0,0.9) 0px 0px 2px !important;"></span>
    </div>
  `;

  let sliderHTML = `
    <input id="slider" class="pbspeed-slider" type="range" min="0.2" max="3" step="0.05"
      style="
        position: relative;
        left: 0px;
        bottom: 0;
        width: 7em;
        height: 1.4em;
        opacity: 0;
        visibility: hidden;
        transition: opacity 0.25s ease, visibility 0.25s ease;
        -webkit-appearance: none;
        outline: none;
        background: transparent;
        border-radius: 1em;
		outline: rgba(255, 255, 255, 0.5) solid 0.15em !important;
		box-shadow: 0 0 0px 1px rgba(255, 255, 255, 0.8) !important;
		cursor: pointer;
		margin-left: -0px;
      "
    />
  `;

  let presetsHTML = `
    <div class="setrs" style="grid-row:1; grid-column:3; display:none; grid-template:1fr 1fr / repeat(4, auto); column-gap:6px;">
      <div>0.25</div><div>0.50</div><div>0.75</div><div>1.00</div>
      <div>1.25</div><div>1.50</div><div>1.75</div><div>2.00</div>
    </div>
  `;

  container.innerHTML = `${displayHTML}${sliderHTML}${presetsHTML}`;

  this._container = container;
  this._display = container.querySelector('.rdisplay');
  this._rateDisplay = this._display.querySelector('.pbspeed-value');
  this._slider = container.querySelector('.pbspeed-slider');
  this._presets = container.querySelector('.setrs');

  this._display.addEventListener('mouseenter', () => {
    this._slider.style.visibility = 'visible';
    this._slider.style.opacity = '1';
	this._slider.style.display = 'block';
  });
  this._container.addEventListener('mouseleave', () => {
    this._slider.style.opacity = '0';
    this._slider.style.visibility = 'hidden';
	this._slider.style.display = 'none';
  });

  for (let x of this._presets.childNodes)
    x.style = 'font-size:14px; line-height:24px; display:flex; align-items:center; cursor:pointer;';
}

  _bind() {
    this._video.addEventListener('ratechange', this._updateRateDisplay.bind(this))

    for (let x of this._presets.childNodes) x.addEventListener('click', this._onPresetClick.bind(this))
  
    this._slider.addEventListener('input', this._onSliderInput.bind(this))
    
    this._display.addEventListener('click', this._onRdisplayClick.bind(this))
    this._display.style.cursor = 'pointer'

    // (How) Can we listen to option changes from a content script?
    // browser.storage.onChanged.addEventListener(e => console.log(e))
    // browser.storage.local.addEventListener('changed', e => console.log(e))
    // browser.storage.local.onChanged.addEventListener(e => console.log(e))
	this._slider.addEventListener(
      "wheel",
      this._onContainerWheel.bind(this),
      { passive: false }
    )
  }
  _onContainerWheel(e) {
    e.preventDefault();
    const step = 0.05;
    const direction = e.deltaY > 0 ? -1 : 1;
    let next = this._video.playbackRate + direction * step;
    next = Math.min(8, Math.max(0, Math.round(next / step) * step));
    this._video.playbackRate = next;
  }
  _updateRateDisplay() {
    let value = this._video.playbackRate
    this._rateDisplay.innerText = `${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`.replace(",", ".")
    this._slider.value = value
  }
  _onPresetClick(e) {
    this._video.playbackRate = e.target.innerText
  }
  _onSliderInput(e) {
    this._video.playbackRate = e.target.value
  }
  _onRdisplayClick(e) {
    this._video.playbackRate = 1.0
  }
  async _updateControlVisibility() {
    let values = await browser.storage.local.get({ 'show-slider': true, 'show-presets': false })
    this._presets.style.display = values['show-presets'] ? 'grid' : 'none'
    this._slider.style.display = values['show-slider'] ? 'block' : 'none'
  }
  _insert() {
    let timeDisplay = this._controlsContainer.querySelector('.ytp-time-display')
    if (timeDisplay) {
      timeDisplay.insertAdjacentElement('afterend', this._container)
      return true
    }
  
    this._controlsContainer.appendChild(this._container)
    return true
  }
}

let init = async () => {
  /**
   * @type {(videoElement: HTMLVideoElement, controlsContainer: Element)}
   */
  let onNewPlayer = (video, controlsContainer) => {
    console.debug('[YouTube Playback Speed Control] Identified elements, initializing controls…', video, controlsContainer)
    new Instance(video, controlsContainer)
  }
  new NormalPlayerObserver(onNewPlayer)
  new ShortsPlayerObserver(onNewPlayer)
}
init()
