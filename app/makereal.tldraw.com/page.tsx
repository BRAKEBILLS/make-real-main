/* eslint-disable @next/next/no-img-element */
/* eslint-disable react-hooks/rules-of-hooks */
'use client'

export const maxDuration = 120

import dynamic from 'next/dynamic'
import 'tldraw/tldraw.css'
import { MyScriptVisualizerButton } from '../components/MyScriptVisualizerButton'
import { PreviewShapeUtil } from '../PreviewShape/PreviewShape'
import { AnimatedMarkShapeUtil } from '../lib/AnimatedMarkShapeUtil'

import Script from 'next/script'
import { useEffect } from 'react'
import { debugEnableLicensing, DefaultMainMenu, DefaultMainMenuContent, useDialogs, useEditor } from 'tldraw'
import { Links } from '../components/Links'
import { SettingsDialog } from '../components/SettingsDialog'
import { applySettingsMigrations, makeRealSettings, PROVIDERS } from '../lib/settings'
import { useHandwritingOCR } from '../hooks/useHandwritingOCR'

debugEnableLicensing()

const Tldraw = dynamic(async () => (await import('tldraw')).Tldraw, {
	ssr: false,
})

const shapeUtils = [PreviewShapeUtil, AnimatedMarkShapeUtil]
const components = {
	SharePanel: () => {
		return (
		<div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
			<MyScriptVisualizerButton />
		</div>
		)
	},
	MainMenu: () => (
		<DefaultMainMenu>
			<DefaultMainMenuContent />
			<Links />
		</DefaultMainMenu>
	),
}

export default function Home() {
	useEffect(() => {
		window.TL_GA4_MEASUREMENT_ID = process.env.NEXT_PUBLIC_GA4_MEASUREMENT_ID
	}, [])

	return (
		<div className="tldraw__editor">
			<Tldraw
				persistenceKey="tldraw"
				shapeUtils={shapeUtils}
				components={components}
				onMount={(e) => {
					;(window as any).editor = e
				}}
			>
				<InsideTldrawContext />
			</Tldraw>
			<Script
				id="tldraw-analytics"
				type="text/javascript"
				strategy="afterInteractive"
				async
				defer
				src="https://analytics.tldraw.com/tl-analytics.js"
			/>
		</div>
	)
}

function InsideTldrawContext() {
	const { addDialog } = useDialogs()
	const editor = useEditor()
	
	const { 
		suggestionsVisible, 
		lastErrorAnalysis,
		hideSmartSuggestions 
	} = useHandwritingOCR();

	useEffect(() => {
		const value = localStorage.getItem('makereal_settings_2')
		if (value) {
			const json = JSON.parse(value)
			const migratedSettings = applySettingsMigrations(json)
			localStorage.setItem('makereal_settings_2', JSON.stringify(migratedSettings))
			makeRealSettings.set(migratedSettings)
		}
		const settings = makeRealSettings.get()

		for (const provider of PROVIDERS) {
			const apiKey = settings.keys[provider.id]
			if (apiKey && provider.validate(apiKey)) {
				return
			}
		}

		// no valid key found, show the settings modal
		addDialog({
			id: 'api keys',
			component: SettingsDialog,
		})
	}, [addDialog])

	return (
		<>
			{/* Development Mode Debug Panel */}
			{process.env.NODE_ENV === 'development' && (
				<div 
					style={{
						position: 'fixed',
						bottom: '20px',
						left: '20px',
						background: 'rgba(0,0,0,0.8)',
						color: 'white',
						padding: '10px',
						borderRadius: '6px',
						fontSize: '11px',
						zIndex: 2000,
						maxWidth: '280px',
						pointerEvents: 'none',
						fontFamily: 'monospace'
					}}
				>
					<div>🎨 tldraw Handwriting Animation System</div>
					<div>Suggestions Visible: {suggestionsVisible ? '✅' : '❌'}</div>
					<div>Error Analysis: {lastErrorAnalysis?.success ? '✅' : '❌'}</div>
					<div>Has Errors: {lastErrorAnalysis?.result?.hasErrors ? '✅' : '❌'}</div>
					<div>Result Count: {lastErrorAnalysis?.result?.results?.length || 0}</div>
				</div>
			)}
		</>
	)
}
