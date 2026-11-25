"""Workspace validation preserves the existing TXT schema and limits."""

def valid(state):
    if not isinstance(state, dict) or not isinstance(state.get('documents'), list):
        return False
    if len(state['documents']) > 1000:
        return False
    collections = [state[key] for key in ('template', 'common') if key in state]
    if any(not isinstance(collection, dict) for collection in collections):
        return False
    for doc in state['documents'] + collections:
        if not isinstance(doc, dict) or not isinstance(doc.get('id'), str) or not isinstance(doc.get('name'), str) or not isinstance(doc.get('nodes'), list):
            return False
        if doc.get('defaultListType', 'unordered') not in ('ordered', 'unordered', 'none'):
            return False
        for n in doc['nodes']:
            if not isinstance(n, dict) or n.get('kind') not in ('heading','item') or not isinstance(n.get('id'),str) or not isinstance(n.get('html'),str) or not isinstance(n.get('level'),int) or not 1 <= n['level'] <= 6 or any(key in n and not isinstance(n[key], bool) for key in ('excluded', 'collapsed', 'raw')) or n.get('listType', 'unordered') not in ('ordered', 'unordered', 'none'):
                return False
    return (state.get('current') in [d['id'] for d in state['documents']] if state['documents'] else state.get('current') is None) and isinstance(state.get('dark'),bool) and isinstance(state.get('font'),str) and isinstance(state.get('size'),(int,float)) and 9 <= state['size'] <= 96

