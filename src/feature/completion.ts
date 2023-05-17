import {
	CompletionClientCapabilities,
	CompletionItem,
	CompletionItemKind,
	CompletionOptions,
} from 'vscode-languageserver';

let documentationMarkdown = false;
let completionItemKinds: CompletionItemKind[];

export function computeCompletionOptions(
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
			allCommitCharacters: ['.', '('],
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
			commitCharacters: ['.', '('],
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
