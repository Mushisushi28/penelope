// node-types.js — Penelope procedure canvas node type registry
// Five node types matching Activepieces/n8n UX patterns.

export const NODE_TYPES = {
  trigger: {
    id: 'trigger',
    label: 'Trigger',
    icon: '◈',
    color: '#4e8a42',
    borderColor: 'rgba(78,138,66,0.6)',
    handles: { target: false, source: true },
    description: 'Procedure entry point',
    defaultData: {
      label: 'On event',
      event: '',
      channel: '',
    },
    fields: [
      { key: 'label',   label: 'Label',   type: 'text' },
      { key: 'event',   label: 'Event',   type: 'text', placeholder: 'e.g. new_inquiry' },
      { key: 'channel', label: 'Channel', type: 'select',
        options: ['', 'sms', 'fb-messenger', 'instagram', 'email', 'any'] },
    ],
  },

  'channel-send': {
    id: 'channel-send',
    label: 'Channel Send',
    icon: '◆',
    color: '#b87333',
    borderColor: 'rgba(184,115,51,0.6)',
    handles: { target: true, source: true },
    description: 'Send a message or ask a question',
    defaultData: {
      label: 'Send message',
      stepKind: 'send_message',
      message: '',
      channel: '',
    },
    fields: [
      { key: 'label',    label: 'Label',    type: 'text' },
      { key: 'stepKind', label: 'Step kind', type: 'select',
        options: ['send_message', 'ask_question', 'send_review_request', 'send_invoice', 'offer_booking_link'] },
      { key: 'message',  label: 'Message',  type: 'textarea', placeholder: 'Template or literal message text' },
      { key: 'channel',  label: 'Channel',  type: 'select',
        options: ['', 'sms', 'fb-messenger', 'instagram', 'email'] },
    ],
  },

  'specialist-call': {
    id: 'specialist-call',
    label: 'Specialist Call',
    icon: '⬡',
    color: '#4a7eb5',
    borderColor: 'rgba(74,126,181,0.6)',
    handles: { target: true, source: true },
    description: 'Compute, look up, or invoke an agent',
    defaultData: {
      label: 'Compute',
      stepKind: 'compute_quote',
      specialist: '',
      args: '',
    },
    fields: [
      { key: 'label',      label: 'Label',      type: 'text' },
      { key: 'stepKind',   label: 'Step kind',  type: 'select',
        options: ['compute_quote', 'lookup_external', 'emit_bus_event', 'escalate',
                  'mark_job_status', 'log_audit', 'set_state', 'schedule_followup'] },
      { key: 'specialist', label: 'Specialist', type: 'text', placeholder: 'e.g. quote_agent' },
      { key: 'args',       label: 'Args (JSON)', type: 'textarea', placeholder: '{"key":"value"}' },
    ],
  },

  condition: {
    id: 'condition',
    label: 'Condition',
    icon: '◇',
    color: '#c97a20',
    borderColor: 'rgba(201,122,32,0.6)',
    handles: { target: true, source: true, sourceTrue: true, sourceFalse: true },
    description: 'Branch on a condition',
    defaultData: {
      label: 'Branch',
      stepKind: 'ask_question',
      condition: '',
      trueBranch: '',
      falseBranch: '',
    },
    fields: [
      { key: 'label',       label: 'Label',       type: 'text' },
      { key: 'condition',   label: 'Condition',   type: 'text', placeholder: 'e.g. answer == "yes"' },
      { key: 'trueBranch',  label: 'True → state', type: 'text', placeholder: 'State ID' },
      { key: 'falseBranch', label: 'False → state',type: 'text', placeholder: 'State ID' },
    ],
  },

  wait: {
    id: 'wait',
    label: 'Wait',
    icon: '◎',
    color: '#6a5acd',
    borderColor: 'rgba(106,90,205,0.6)',
    handles: { target: true, source: true },
    description: 'Pause until an event or timeout',
    defaultData: {
      label: 'Wait',
      stepKind: 'wait_for_event',
      event: '',
      timeout: '',
    },
    fields: [
      { key: 'label',   label: 'Label',   type: 'text' },
      { key: 'stepKind',label: 'Step kind', type: 'select',
        options: ['wait_for_event', 'schedule_followup'] },
      { key: 'event',   label: 'Event',   type: 'text', placeholder: 'e.g. customer_reply' },
      { key: 'timeout', label: 'Timeout', type: 'text', placeholder: 'e.g. 24h' },
    ],
  },

  unsupported: {
    id: 'unsupported',
    label: 'Unsupported',
    icon: '?',
    color: '#7a8a65',
    borderColor: 'rgba(122,138,101,0.4)',
    handles: { target: true, source: true },
    description: 'Step kind not supported by the editor',
    defaultData: { label: 'Unknown step' },
    fields: [
      { key: 'label', label: 'Label', type: 'text' },
    ],
  },
};

// Map a YAML step kind to a node type id
const STEP_KIND_MAP = {
  send_message:       'channel-send',
  ask_question:       'channel-send',
  offer_booking_link: 'channel-send',
  send_review_request:'channel-send',
  send_invoice:       'channel-send',

  compute_quote:      'specialist-call',
  lookup_external:    'specialist-call',
  emit_bus_event:     'specialist-call',
  escalate:           'specialist-call',
  mark_job_status:    'specialist-call',
  log_audit:          'specialist-call',
  set_state:          'specialist-call',
  schedule_followup:  'specialist-call',
  compute_structured: 'specialist-call',
  classify_text:      'specialist-call',

  wait_for_event:     'wait',
};

export function stepKindToNodeType(stepKind) {
  return STEP_KIND_MAP[stepKind] || 'unsupported';
}
