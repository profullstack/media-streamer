#!/usr/bin/env python3

import requests
requests.packages.urllib3.disable_warnings()



headers = {
	'authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJleHAiOjE3NzA0MjY0NjQsImlhdCI6MTc2NzgzNDQ2NCwic3ViIjoiODI2ODIzNTYiLCJ1c2VybmFtZSI6ImFudGhvbnkyOTYzIiwiZGF0YSI6Ik18LTEiLCJzY29wZXMiOiIiLCJ2ZXJzaW9uIjowfQ.ovERWdQ_IdfTlYIdhvb0n9y-srMejUmSzhmMlVwBecA',
	'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36',
}

keyword = input("what do you want to search for?")

params = {
	"audioport": "Speaker",
	"con": "wifi",
	"device": "phone",
	"fulltextsearch": "true",
	"itemUrlScheme": "secure",
	"listenId": "1769228237",
	"locale": "en",
	"orientation": "portrait",
	"origin": "active",
	"partnerId": "M2t9wS30",
	"query": keyword,
	"render": "json",
	"resolution": "440,956",
	"serial": "6A39BB01-6E01-4EED-AE1A-6ED2CD3DE6CB",
	"version": "40.7.1",
	"viewModel": "true"
}

fav_data = requests.get("https://api.radiotime.com/profiles", params=params, headers=headers, verify=False).json()

def get_stream(id):
	stream_data = requests.get(f"https://opml.radiotime.com/Tune.ashx?&id={id}&itemUrlScheme=secure&partnerId=RadioTime&version=7.10.2&formats=mp3%2Caac%2Cogg%2Cflash%2Chtml%2Chls&render=json", headers=headers, verify=False).json()
	
	for stream in stream_data['body']:
		if stream['media_type'] == 'mp3':
			return stream['url']
			break
	if len(stream_data['body']) > 0:
		return stream_data['body'][0]['url']

def get_pod_info(id):
	pod_info = requests.get(f'https://api.radiotime.com/profiles/{id}/contents', headers=headers, verify=False).json()
	for x in pod_info["Items"]:
		list = x.get("Children")
		if list:
			for y in list:
				return y["GuideId"]

for item in fav_data["Items"]:
	list = item.get("List") or item.get("Gallery")
	if not list:
		continue
	for ite in list["Items"]:
		cell = next(
			(value for key, value in ite.items() if key.endswith('Cell')),
			None
		)
		id = cell.get('GuideId')
		if not id:
			continue
		if not id:
			print('didnt find cell!')
		else:
			content_info = cell.get("ContentInfo")
			seo_info = cell.get('SEOInfo')
			if not seo_info:
				print('no seo info! skipping')
				continue
			print(seo_info['Title'])
			if content_info:
				if content_info['Type'] == 'Audiobook':
					continue
				print(content_info['Type'])
				if content_info['Type'] != 'Station':
					id = get_pod_info(id)
			print(get_stream(id))
			