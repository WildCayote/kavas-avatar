import React from "react";
import { VoiceVideoRecorder } from "./VoiceVideoRecorder";
import VoiceRecorder from "./VoiceRecorder";

const UI = ({ onAudioReceived, isTalking }) => {
  console.log("is talking in UI: ", isTalking);
  return (
    <div>
      <VoiceRecorder onAudioReceived={onAudioReceived} isTalking={isTalking} />
      {/* <VoiceVideoRecorder
        onAudioReceived={onAudioReceived}
        isTalking={isTalking}
      /> */}
    </div>
  );
};

export default React.memo(UI);
