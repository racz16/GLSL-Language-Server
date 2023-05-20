import {
	CompletionClientCapabilities,
	CompletionItem,
	CompletionItemKind,
	CompletionOptions,
} from 'vscode-languageserver';

import { DOT, LRB } from '../core/constants';

let documentationMarkdown = false;
let completionItemKinds: CompletionItemKind[];

export function getCompletionOptions(
	capabilities: CompletionClientCapabilities | undefined
): CompletionOptions | undefined {
	if (!capabilities) {
		return undefined;
	} else {
		documentationMarkdown =
			!!capabilities.completionItem?.documentationFormat?.some(
				(df) => df === 'markdown'
			);
		completionItemKinds = capabilities.completionItemKind?.valueSet ?? [];
		return {
			resolveProvider: false,
			allCommitCharacters: [DOT, LRB],
		};
	}
}

export function completionHandler(): CompletionItem[] {
	return [
		{
			label: 'TypeScript',
			kind: completionItemKinds.some(
				(cik) => cik === CompletionItemKind.Text
			)
				? CompletionItemKind.Text
				: undefined,
			commitCharacters: [DOT, LRB],
			detail: 'detail',
			documentation: documentationMarkdown
				? { kind: 'markdown', value: '# documentation' }
				: 'documentation',
			labelDetails: {
				description: 'labelDetails',
				detail: 'labelDetails.detail',
			},
		},
		{
			label: 'JavaScript',
			kind: CompletionItemKind.Text,
			data: 2,
		},
	];
}
