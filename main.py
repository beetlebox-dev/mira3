from flask import Flask, Response, render_template, request, url_for, redirect
from admin import admin_alert_thread


# (c) 2022 Johnathan Pennington | All rights reserved.


app = Flask(__name__)


@app.errorhandler(404)
def page_not_found(e):

    skip_endpoints = tuple()
    ignore_paths_starting_with = [  # Doesn't send an admin alert if request.path starts with any of these.
        '20', 'admin', 'blog', 'cms', 'feed', 'media', 'misc', 'news', 'robots', 'site', 'sito',
        'shop', 'test', 'web', 'wordpress', 'Wordpress', 'wp', 'Wp', 'xmlrpc.php',
    ]
    site_root = url_for('mira3', _external=True).split('//', 1)[-1][:-1]
    # Siteroot includes domain, but removes http:// or https:// if present, and removes the final forward slash.
    a_text = site_root
    rel_path = '/'

    request_of_concern = True
    for path_to_ignore in ignore_paths_starting_with:
        if request.path.startswith(f'/{path_to_ignore}'):
            request_of_concern = False
            break

    if request_of_concern:

        for rule in app.url_map.iter_rules():
            if "GET" in rule.methods and rule.endpoint not in skip_endpoints and len(rule.arguments) == 0:
                # Static folder has rule.arguments, so is skipped and rerouted to root.
                if request.path.startswith(rule.rule):  # Rule.rule is relative path.
                    rel_path = url_for(rule.endpoint)
                    if rel_path == '/':
                        continue  # Otherwise, displays final slash after site root <a> text.
                    a_text = f'{site_root}<wbr>{rel_path}'
                    break

        message_body = f'Page not found: \n{request.url}\n' \
                       f'Rendered page_not_found.html and suggested: \n{site_root}{rel_path}'
        admin_alert_thread('Web App - 404', message_body)

    return render_template('page_not_found.html', relpath=rel_path, a_text=a_text), 404


@app.route('/serverterminal', methods=['POST'])
def server_terminal():
    if request.method == 'POST':
        if 'appname' not in request.form or 'userstartmsec' not in request.form or 'usersecs' not in request.form:
            message_list = ['Bad request to server_terminal.', 'POST arguments below.']
            for item in request.form:
                message_line = f'{item}: {request.form[item]}'
                message_list.append(message_line)
            message = '\n'.join(message_list)
            admin_alert_thread('Web App - ERROR', message)
            return Response(status=400)
        app_name = request.form['appname']
        user_start_msec = request.form['userstartmsec']
        user_secs = request.form['usersecs']
        message = f'{app_name}\nUser Time Log\nUser timestamp id: {user_start_msec}\n' \
                  f'User duration: {user_secs} seconds'
        admin_alert_thread('Web App - Log', message)
        return Response(status=200)


@app.route('/favicon.ico')
def favicon():
    return redirect(url_for('static', filename='favicon.ico'))


@app.route('/')
def mira3():
    return render_template('mira3.html')


if __name__ == '__main__':
    app.run()
