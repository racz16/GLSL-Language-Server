import {
	CompletionClientCapabilities,
	CompletionItem,
	CompletionItemKind,
	CompletionOptions,
} from 'vscode-languageserver';

import { DOT, LRB } from '../core/constants';

export class CompletionProvider {
	private static documentationMarkdown = false;
	private static completionItemKinds: CompletionItemKind[];

	public static getCompletionOptions(
		capabilities: CompletionClientCapabilities | undefined
	): CompletionOptions | undefined {
		if (!capabilities) {
			return undefined;
		} else {
			this.documentationMarkdown = !!capabilities.completionItem?.documentationFormat?.some(
				(df) => df === 'markdown'
			);
			this.completionItemKinds = capabilities.completionItemKind?.valueSet ?? [];
			return {
				resolveProvider: false,
				allCommitCharacters: [DOT, LRB],
			};
		}
	}

	public static completionHandler(): CompletionItem[] {
		return new CompletionProvider().onCompletion();
	}

	private onCompletion(): CompletionItem[] {
		return [
			{
				label: 'TypeScript',
				kind: CompletionProvider.completionItemKinds.some((cik) => cik === CompletionItemKind.Text)
					? CompletionItemKind.Text
					: undefined,
				commitCharacters: [DOT, LRB],
				detail: 'detail',
				documentation: CompletionProvider.documentationMarkdown
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
}
