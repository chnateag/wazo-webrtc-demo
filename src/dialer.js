const sessions = {};
let currentSession;
const inConference = false;
let currentAtxfer;
// let sessionIdsInMerge = [];

const setGreeter = async () => {
  const user = await Wazo.getApiClient().confd.getUser(
    Wazo.Auth.getSession().uuid,
  );
  const name = user.firstName;

  $('.greeter').html(`Hello ${name} 👋`);
};

const setMainStatus = (status) => {
  $('#status').html(status);
};

const getNumber = (callSession) => callSession.realDisplayName || callSession.displayName || callSession.number;

const getStatus = (callSession) => {
  const number = getNumber(callSession);

  if (callSession.paused) {
    return `Call with ${number} on hold`;
  }

  if (callSession.muted) {
    return `Call with ${number} muted`;
  }

  switch (callSession.sipStatus) {
    case Wazo.Phone.SessionState.Initial:
    case Wazo.Phone.SessionState.Establishing:
      return `Calling ${number}...`;
    case Wazo.Phone.SessionState.Established:
      return `On call with : ${number}`;
    case Wazo.Phone.SessionState.Terminated:
      return `Call canceled by ${number}`;
    default:
      return `Unknown status: ${callSession.sipStatus}`;
  }
};

// eslint-disable-next-line no-unused-vars
const initializeWebRtc = () => {
  Wazo.Phone.connect({
    media: {
      audio: true,
      video: true,
    },
    // log: { builtinEnabled: true, logLevel: 'debug' },
  });

  const onSessionUpdate = (callSession) => {
    sessions[callSession.getId()] = callSession;
    updateScenes();
  };

  Wazo.Phone.on(Wazo.Phone.ON_CALL_INCOMING, (callSession, withVideo) => {
    bindSessionCallbacks(callSession);
    openIncomingCallModal(callSession, withVideo);
  });
  Wazo.Phone.on(Wazo.Phone.ON_CALL_ACCEPTED, (callSession, withVideo) => {
    onCallAccepted(callSession, withVideo);
  });
  Wazo.Phone.on(Wazo.Phone.ON_CALL_ENDED, () => {
    updateScenes('Call ended');
  });
  Wazo.Phone.on(Wazo.Phone.ON_CALL_HELD, onSessionUpdate);
  Wazo.Phone.on(Wazo.Phone.ON_CALL_UNHELD, onSessionUpdate);
  Wazo.Phone.on(Wazo.Phone.ON_CALL_MUTED, onSessionUpdate);
  Wazo.Phone.on(Wazo.Phone.ON_CALL_UNMUTED, onSessionUpdate);
  Wazo.Phone.on(
    Wazo.Phone.ON_REINVITE,
    (session, request, updatedCalleeName) => {
      const callSession = sessions[session.id];
      if (callSession) {
        currentSession.realDisplayName = updatedCalleeName;

        onSessionUpdate(currentSession);
      }
    },
  );

  // setFullName();
  setGreeter();
  initializeMainDialer();
};

function onCallAccepted(callSession, withVideo) {
  sessions[callSession.getId()] = callSession;
  currentSession = callSession;
  $('.calling').addClass('calling-page').removeClass('video-calling');
  $('#status').addClass('oncall');
  $('.buttons').removeClass('buttons-video');

  addScene(callSession, withVideo);
  updateScenes();
}

function onPhoneCalled(callSession) {
  sessions[callSession.getId()] = callSession;
  currentSession = callSession;
  $('.calling').addClass('calling-page');
  $('#status').addClass('oncall').removeClass('on-videocall');

  bindSessionCallbacks(callSession);
}

function onCallTerminated(callSession, origin = '') {
  delete sessions[callSession.getId()];
  $('.calling').removeClass('calling-page');
  $('#status').removeClass('oncall');
  $('#status').removeClass('on-videocall');
  $('.buttons').removeClass('buttons-video');
  $('main').removeClass('isVideo');
  $('main').removeClass('isAudio');

  // Current session terminated ?
  if (currentSession && currentSession.getId() === callSession.getId()) {
    // Remaining session ? take first
    currentSession = Object.keys(sessions).length
      ? sessions[Object.keys(sessions)[0]]
      : null;
    if (currentSession) {
      unhold(currentSession);
    }
  }

  currentAtxfer = null;

  updateScenes(`Call with ${getNumber(callSession)} ended (${origin})`);
}

function accept(callSession, withVideo) {
  console.log(`accepting ${getNumber(callSession)} ${withVideo ? 'withVideo' : 'withoutVideo'}`);
  // Hold current session & creates the multiple calls handler if exists 
  if (currentSession && !inConference) {
    hold(currentSession);
    
    const currentNumber = getNumber(currentSession);
    const newNumber = getNumber(callSession);
  }

  Wazo.Phone.accept(callSession, withVideo);

  onCallAccepted(callSession, withVideo);
}

function unhold(callSession) {
  console.log(`resuming ${getNumber(callSession)}`);
  Wazo.Phone.resume(callSession);
}

function hold(callSession) {
  console.log(`holding ${getNumber(callSession)}`);
  Wazo.Phone.hold(callSession);
}

function mute(callSession) {
  console.log(`muting ${getNumber(callSession)}`);
  Wazo.Phone.mute(callSession);
}

function unmute(callSession) {
  console.log(`unmuting ${getNumber(callSession)}`);
  Wazo.Phone.unmute(callSession);
}

function hangup(callSession) {
  console.log(`hanging up ${getNumber(callSession)}`);
  Wazo.Phone.hangup(callSession);
}

/*
function startConference() {
  Wazo.Phone.merge(Object.values(sessions));

  inConference = true;
  sessionIdsInMerge = Object.keys(sessions);

  updateScenes('Conference started');
}

function endConference() {
  inConference = false;
  const sessionToUnmerge = Object.values(sessions).filter(session => sessionIdsInMerge.indexOf(session.getId()) !== -1);

  webRtcClient.unmerge(sessionToUnmerge).then(() => {
    updateScenes('Conference ended');
  });

  sessionIdsInMerge = [];
}

function addToMerge(session) {
  webRtcClient.addToMerge(session);
  sessionIdsInMerge.push(session.getId());

  updateScenes(getNumber(session) + ' added to merge');
}

function removeFromMerge(session) {
  webRtcClient.removeFromMerge(session, true);

  const sessionIndex = sessionIdsInMerge.indexOf(session.getId());
  sessionIdsInMerge.splice(sessionIndex, 1);

  if (sessionIdsInMerge.length === 1) {
    endConference();
  }

  updateScenes(getNumber(session) + ' removed from merge');
}
*/

function transfer(callSession, target) {
  Wazo.Phone.transfer(callSession, target);

  updateScenes();
}

function initializeMainDialer(status) {
  const scene = $('#root-scene');
  const numberField = $('.number', scene);
  const mergeButton = $('.merge', scene);
  const unmergeButton = $('.unmerge', scene);
  const videoButton = $('.video-call', scene);
  const reduceVideoButton = $('.reduce');
  const expandVideoButton = $('.expand');

  videoButton.show();
  $('.hangup', scene).hide();
  reduceVideoButton.hide();
  expandVideoButton.hide();
  unmergeButton.hide();
  mergeButton.hide();
  numberField.val('');
  setMainStatus(status || '');

  const call = async (video = false) => {
    const callSession = await Wazo.Phone.call(numberField.val(), video);

    if (currentSession && !inConference) {
      hold(currentSession);
    }

    onPhoneCalled(callSession);

    updateScenes();
    $('main').addClass(video ? 'isVideo' : 'isAudio');
  };

  scene.off('submit').on('submit', e => {
    e.preventDefault();

    call(false);
  });

  // if (inConference) {
  //   unmergeButton.show();
  // } else if(Object.keys(sessions).length > 1) {
  //   mergeButton.show();
  // }

  // mergeButton.off('click').on('click', function (e) {
  //   e.preventDefault();
  //   startConference();
  // });
  //
  // unmergeButton.off('click').on('click', function (e) {
  //   e.preventDefault();
  //   endConference();
  // });

  videoButton.off('click').on('click', e => {
    e.preventDefault();
    call(true);
  });

  updateScenes();
}

function bindSessionCallbacks(callSession) {
  const number = getNumber(callSession);

  Wazo.Phone.on(Wazo.Phone.ON_CALL_ACCEPTED, () => updateScenes());
  Wazo.Phone.on(Wazo.Phone.ON_CALL_FAILED, () => {
    onCallTerminated(callSession);
    setMainStatus(`Call with ${number} failed`);
  });
  Wazo.Phone.on(Wazo.Phone.ON_CALL_ENDED, () => {
    onCallTerminated(callSession, 'onCallEnded');
    setMainStatus(`Call with ${number} ended`);
  });
}

function addScene(callSession, withVideo) {
  const newScene = $('#root-scene')
    .clone()
    .attr('data-name', getNumber(callSession))
    .attr('id', `call-${callSession.getId()}`);
  // const isSessionInMerge = sessionIdsInMerge.indexOf(session.getId()) !== -1;
  const hangupButton = $('.hangup', newScene);
  const unholdButton = $('.unhold', newScene);
  const holdButton = $('.hold', newScene);
  const muteButton = $('.mute', newScene);
  const unmuteButton = $('.unmute', newScene);
  const mergeButton = $('.merge', newScene).html('Add to merge');
  const unmergeButton = $('.unmerge', newScene).html('Remove from merge');
  const atxferButton = $('.atxfer', newScene);
  const transferButton = $('.transfer', newScene);
  const dialButton = $('.audio-call', newScene);
  const videoButton = $('.video-call', newScene);
  const reduceVideoButton = $('.reduce', newScene);
  const expandVideoButton = $('.expand', newScene);

  $('.form-group', newScene).hide();
  holdButton.hide();
  videoButton.hide();
  unholdButton.hide();
  muteButton.hide();
  unmuteButton.hide();
  mergeButton.hide();
  unmergeButton.hide();
  atxferButton.hide();
  transferButton.hide();
  reduceVideoButton.hide();
  expandVideoButton.hide();

  // Videos
  const videoContainer = $('.videos', newScene);
  if (withVideo) {
    videoContainer.show();
    videoContainer.addClass('background-videocall');
    $('#status').removeClass('oncall').addClass('on-videocall');
    $('.calling-page').addClass('video-calling');
    $('.buttons').addClass('buttons-video');
    reduceVideoButton.show();

    // Reduce & Expand video screen
    
    reduceVideoButton.on('click', e => {
      e.preventDefault;
      $('video').addClass('reduce-video');
      reduceVideoButton.hide();
      expandVideoButton.show();
    })

    expandVideoButton.on('click', e => {
      e.preventDefault;
      $('video').removeClass('reduce-video');
      expandVideoButton.hide();
      reduceVideoButton.show();
    })


    // Local video
    const localStream = Wazo.Phone.getLocalVideoStream(callSession);
    const localVideo = $('.local video', newScene)[0];
    localVideo.srcObject = localStream;
    localVideo.play();

    // Remote video
    const $remoteVideo = $('.remote video', newScene);
    const remoteStream = Wazo.Phone.getRemoteStreamForCall(callSession);
    if (remoteStream) {
      $remoteVideo.show();
      const wazoStream = new Wazo.Stream(remoteStream);
      wazoStream.attach($remoteVideo[0]);
    }
  } else {
    videoContainer.hide();
    $('#status').removeClass('on-videocall').addClass('oncall');
  }

  if (callSession.paused) {
    unholdButton.show();
  } else {
    holdButton.show();
  }

  if (callSession.muted) {
    unmuteButton.show();
  } else {
    muteButton.show();
  }

  if (inConference) {
    // eslint-disable-next-line no-undef
    if (isSessionInMerge) {
      unmergeButton.show();
    } else {
      mergeButton.show();
    }
  }

  dialButton.hide();
  dialButton.prop('disabled', true);

  hangupButton.show();
  hangupButton.off('click').on('click', (e) => {
    e.preventDefault();
    hangup(callSession);
  });

  unholdButton.off('click').on('click', (e) => {
    e.preventDefault();
    unhold(callSession);
  });

  holdButton.off('click').on('click', (e) => {
    e.preventDefault();
    hold(callSession);
  });

  muteButton.off('click').on('click', (e) => {
    e.preventDefault();
    mute(callSession);
  });

  unmuteButton.off('click').on('click', (e) => {
    e.preventDefault();
    unmute(callSession);
  });

  // mergeButton.off('click').on('click', function (e) {
  //   e.preventDefault();
  //   addToMerge(callSession);
  // });
  //
  // unmergeButton.off('click').on('click', function (e) {
  //   e.preventDefault();
  //   removeFromMerge(callSession);
  // });

  atxferButton.show();
  atxferButton.off('click').on('click', (e) => {
    e.preventDefault();

    if (currentAtxfer) {
      currentAtxfer.complete();
      currentAtxfer = null;

      updateScenes();
    } else {
      const target = prompt('Phone number atxfer?');
      if (target != null) {
        currentAtxfer = Wazo.Phone.atxfer(callSession);
        currentAtxfer.init(target);
        atxferButton.html('Complete');
      }
    }
  });

  transferButton.show();
  transferButton.off('click').on('click', (e) => {
    e.preventDefault();

    const target = prompt('Phone number transfer?');
    if (target != null) {
      transfer(callSession, target);
    }
  });

  newScene.appendTo($('#scenes'));

  return newScene;
}

/* 
  Trying to make the calls handler work 

  function resume(callSessionId) {
    const callSession = sessions[callSessionId];

    Wazo.Phone.resume(callSession);

    Object.keys(sessions).forEach((sessionId) => {
      const cs = sessions[sessionId];
      if (sessionId !== callSession.getId && !callSession.paused) {
        Wazo.Phone.hold(cs);
      } 
    });
  }
*/


function switchCall(event) {
  event.stopImmediatePropagation();

  const sessionId = $(event.target).attr('data-sessionid');
  const callSession = sessions[sessionId];
  
  if (currentSession.is(callSession)) {
    console.log('active call, no switching');
    return;
  }

  console.log(`attempting to resume callSession "${getNumber(callSession)}"`);
  unhold(callSession);
  currentSession = callSession;
  updateScenes();
}

function updateScenes(status) {
  $('#scenes').html('');
  $('#calls-handler').html('');

  // this is legacy status from resetMainDialer
  if (status) {
    console.log(status);
  }

  // @FIXME: Handle status in multi-call environment

  $('#dialer')[!Object.keys(sessions).length ? 'show' : 'hide']();
  
  Object.keys(sessions).forEach(sessionId => {
    const callSession = sessions[sessionId];
    const newScene = addScene(callSession, callSession.cameraEnabled);
    const isActive = currentSession.is(callSession);
    const label = getNumber(callSession)

    if (!isActive) {
      newScene.hide();
    }

    const bouton = $('#calls-handler').append(`<button type="button" data-sessionid="${sessionId}" class="btn btn-primary${isActive ? ' active' : ''}">${label}</button>`);
    bouton.click(switchCall);
  });
}

function openIncomingCallModal(callSession, withVideo) {
  const number = callSession.realDisplayName
    || callSession.displayName
    || callSession.number;

  $('#incoming-modal').modal('show');
  $('#dialer').hide();
  $('#status').hide();
  $('#incoming-modal h5 span').html(number);

  $('#accept-video')[withVideo ? 'show' : 'hide']();

  $('#accept')
    .off('click')
    .on('click', () => {
      $('#incoming-modal').modal('hide');
      $('#status').show();
      accept(callSession, false);
    });
  $('#accept-video')
    .off('click')
    .on('click', () => {
      $('#incoming-modal').modal('hide');
      $('#status').show();
      accept(callSession, true);
    });
  $('#reject')
    .off('click')
    .on('click', () => {
      Wazo.Phone.reject(callSession);
      $('#incoming-modal').modal('hide');
      $('#status').show();
    });
}
